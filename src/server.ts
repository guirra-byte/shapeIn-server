import Fastify, {
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
} from "fastify";
import ngrok from "@ngrok/ngrok";
import fs from "node:fs";
import fastifyCors from "@fastify/cors";
import fastifyQuerystring from "fastify-qs";
import dotenv from "dotenv";
import { AddUserBatchHandler } from "./handlers/add-user.handler";
import { UserRepository } from "./repository/user/user-repository";
import {
  SseHandshakeHandler,
  SseNotifyHandler,
} from "./handlers/sse-client.handler";
import { CheckinHandler } from "./handlers/checkin.handler";
import { LoginHandler } from "./handlers/auth/login-handlers";
import { RefreshTokenHandler } from "./handlers/auth/refresh-token.handler";
import { GoogleFormsWebhookHandler } from "./handlers/google-forms-webhook.handler";
import { AuthMiddleware } from "./middlewares/auth.middleware";

dotenv.config();

const fastify = Fastify({ logger: true });
fastify.register(fastifyQuerystring, { prefix: "/api" });
fastify.register(fastifyCors, {
  origin: "*",
  credentials: false,
  prefix: "/api",
});

const sseNotifyHandler = new SseNotifyHandler();
const userRepository = UserRepository.instance;

const googleFormsWebhookHandler = new GoogleFormsWebhookHandler(
  userRepository,
  sseNotifyHandler
);

const authMiddleware = new AuthMiddleware(userRepository);
const authorizationPreHandler = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  if (request.url !== "/api/webhook") {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    const isAuthorized = await authMiddleware.handle(request, reply);

    if (isAuthorized instanceof Error) {
      reply.code(401).send({ error: isAuthorized.message });
      return;
    }
  }
};

fastify.route({
  url: "/api/webhook",
  method: "POST",
  preHandler: [
    async (request: FastifyRequest, reply: FastifyReply) => {
      const origin = request.headers["user-agent"];
      const compatibleRegExp = /\(compatible; Google-Apps-Script; beanserver;/;
      const originRegExp = /\+https:\/\/script\.google\.com;/;

      if (
        origin &&
        (!compatibleRegExp.test(origin) || !originRegExp.test(origin))
      ) {
        return reply
          .status(403)
          .send({ message: "Unauthorized Webhook!" });
      }
    },
  ],
  handler: (request: FastifyRequest, reply: FastifyReply) => 
  googleFormsWebhookHandler.handle(request, reply),
});

const addUserHandler = new AddUserBatchHandler(
  userRepository,
  sseNotifyHandler
);

fastify.route({
  url: "/checkin/add-user",
  method: "POST",
  preHandler: [authorizationPreHandler],
  handler: async (request: FastifyRequest, reply: FastifyReply) =>
    addUserHandler.handle(request, reply),
});

const sseHandshakeHandler = new SseHandshakeHandler();
fastify.route({
  url: "/checkin/events/:type",
  schema: {
    params: {
      type: "object",
      properties: {
        type: { type: "string" },
      },
      required: ["type"],
    },
  },
  method: "GET",
  preHandler: [authorizationPreHandler],
  handler: async (request: FastifyRequest, reply: FastifyReply) =>
    sseHandshakeHandler.execute(request, reply),
});

const checkinHandler = new CheckinHandler(userRepository, sseNotifyHandler);
fastify.route({
  url: "/checkin/:id",
  schema: {
    params: {
      type: "object",
      properties: {
        id: { type: "string" },
      },
      required: ["id"],
    },
  },
  method: "GET",
  preHandler: [authorizationPreHandler],
  handler: async (request: FastifyRequest, reply: FastifyReply) =>
    checkinHandler.handle(request, reply),
});

// Login Handler
const loginHandler = new LoginHandler(userRepository);
fastify.route({
  url: "/auth/login",
  method: "POST",
  handler: (request: FastifyRequest, reply: FastifyReply) =>
    loginHandler.handle(request, reply),
});

// Renew access_token
const refreshTokenHandler = new RefreshTokenHandler();
fastify.route({
  url: "/auth/refresh",
  method: "GET",
  preHandler: [authorizationPreHandler],
  handler: async (request: FastifyRequest, reply: FastifyReply) =>
    refreshTokenHandler.handle(request, reply),
});

// Logout Handler
fastify.route({
  url: "/auth/logout",
  method: "POST",
  handler: async (request: FastifyRequest, reply: FastifyReply) => {
    reply.raw.removeHeader("Set-Cookie");
    reply.status(200).send({ message: "Logout" });
  },
});

async function main() {
  try {
    const port = 8888;
    await fastify.listen({ port }).then(async (connectionString) => {
      await ngrok
        .connect({
          addr: port,
          authtoken: process.env.NGROK_AUTHTOKEN,
          traffic_policy: fs.readFileSync("./policy.json", "utf8"),
        })
        .then(async (ngrokProxy) => {
          const proxyUrl = ngrokProxy.url();
          console.log(
            `Server is running on port ${connectionString} - ${proxyUrl}`
          );
        });
    });
  } catch (error) {
    console.error(error);
  }
}

main();
