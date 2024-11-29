import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import { createClient, RedisClientType } from "redis";
import { PrismaClient } from "@prisma/client";
import { EventEmitter } from "node:events";
import ngrok from "@ngrok/ngrok";
import { nanoid } from "nanoid";
import QrCode from "qrcode-terminal";
import z from "zod";

interface Class {
  date: string;
  theme: string; 
  speaker: string;
  stage: string;
}

interface Lifeshaper {
  id: string;
  stage: string;
  name: string;
  cpf: string;
  birth_date: string;
  conn: RedirectUrl[];
}

interface RedirectUrl {
  id: string;
  tmp_url: string;
  status: string;
}

let redis;
const fastify = Fastify({ logger: true });
const prismaClient = new PrismaClient();
const handshakeRedisConnection = async () => {
  try {
    redis = await createClient().connect();
  } catch (error) {
    console.error(error);
  }
};

const lifeshapersUrl: RedirectUrl[] = [];
interface IRepository<T> {
  save(data: T): Promise<void>;
  getById(id: string): Promise<T | undefined>;
}

class LifeshaperRepository implements IRepository<Lifeshaper> {
  constructor(private redisClient: RedisClientType) {}
  async save(data: Lifeshaper): Promise<void> {
    await this.redisClient.set(`${data.id}`, JSON.stringify(data));
  }

  async getById(id: string): Promise<Lifeshaper | undefined> {
    const lifeshaper = await this.redisClient.get(id);
    if (lifeshaper) return JSON.parse(lifeshaper) as Lifeshaper;
    return undefined;
  }
}

class ClassRepository implements IRepository<Class> {
  constructor(private redisClient: RedisClientType) {}
}

class CheckIn extends EventEmitter {
  private static _instance: CheckIn;
  private constructor() {
    super();
  }

  public static get instance() {
    if (!this._instance) {
      this._instance = new CheckIn();
    }

    return this._instance;
  }
}

const checkIn = CheckIn.instance;
const checkInConsumer = () => {
  checkIn.on("did", (id: string) => {
    const currentLifeshaper = lifeshapersUrl.find((url) => url.id === id);
    if (!currentLifeshaper) {
      throw new Error("Resource not found!");
    }
  });

  checkIn.on("register", (data: Lifeshaper) => {});
};

fastify.route({
  method: "GET",
  url: "/checkin/:id",
  schema: {
    params: {
      type: "object",
      properties: {
        id: { type: "string" }
      },
      required: ["id"]
    }
  },
  handler: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    checkIn.emit("did", id);
    reply.send("<h1>Registrado</h1>");
  }
});

const registerSchema = z.object({
  class: z.string(),
  name: z.string(),
  cpf: z.string(),
  birth_date: z.string()
});

fastify.route({
  method: "POST",
  url: "/checkin/register",
  handler: async (request: FastifyRequest, reply: FastifyReply) => {
    const data = registerSchema.parse(request.body);
  }
});

async function mountRedirectUrl(data: any, appUrl: string) {
  const currentDataId = nanoid();
  const uniqueUrl = `${appUrl}/checkin/${currentDataId}`;
  const transferData = {
    name: data.name,
    tmp_url: uniqueUrl,
    id: currentDataId
  };

  checkIn.emit("register", transferData);
  return uniqueUrl;
}

async function main() {
  try {
    const port = 8888;
    await fastify.listen({ port }).then(async (connectionString) => {
      console.log(`Server is running on port ${connectionString}`);
      const data = JSON.stringify({
        id: 6,
        name: "Micaele Castro",
        stage: "Shapers",
        class_date: "2024-11-28T10:00:00",
        status: "PRESENTE",
        arrived_at: null
      });

      await ngrok
        .connect({ authtoken_from_env: true, port })
        .then(async (ngrokProxy) => {
          const proxyUrl = ngrokProxy.url();
          if (proxyUrl) {
            const redirectUrl = await mountRedirectUrl(data, proxyUrl);
            QrCode.generate(redirectUrl, { small: true }, (qrcode: string) => {
              console.log(qrcode);
            });
          }
        });
    });
  } catch (error) {
    console.error(error);
  }
}

main();
checkInConsumer();
handshakeRedisConnection();
