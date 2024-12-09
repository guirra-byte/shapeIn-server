import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import ngrok from "@ngrok/ngrok";
import { nanoid } from "nanoid";
import QrCode from "qrcode";
import fs from "node:fs";
import z from "zod";
import { Resend } from "resend";
import fastifyCors from "@fastify/cors";
import path from "node:path";
import dotenv from "dotenv";

interface CheckIn {
  id: string;
  arrived_at: string;
  email: string;
  name: string;
  status: string;
  stage: string;
}

const toDoCheckin: CheckIn[] = [];
const qrcodesFilepaths: { id: string; filepath: string }[] = [];
const checkinDb: CheckIn[] = [];
const sseClients: FastifyReply[] = [];

let APP_URL = "";
dotenv.config();
const fastify = Fastify({ logger: true });
fastify.register(fastifyCors, {
  origin: "*",
});

const corsHeaders: { key: string; value: string }[] = [
  { key: "Access-Control-Allow-Origin", value: "*" },
  { key: "Access-Control-Allow-Methods", value: "*" },
];
const sseHeaders: { key: string; value: string }[] = [
  { key: "Content-Type", value: "text/event-stream" },
  { key: "Cache-Control", value: "no-cache" },
  { key: "Connection", value: "keep-alive" },
];

async function mountRedirectUrl(id: string, appUrl: string) {
  const uniqueUrl = `${appUrl}/checkin/${id}`;
  return uniqueUrl;
}

const resend = new Resend(process.env.RESEND_KEY);
const fetchQrCode = async (qrcodeUrl: string, to: string[]) => {
  const { error } = await resend.emails.send({
    from: "Acme <onboarding@resend.dev>",
    to,
    subject: "Your Checkin Qr Code",
    html: `<!DOCTYPE html>
      <html>
      <head>
        <title>QR Code</title>
      </head>
      <body style="font-family: Arial, sans-serif; text-align: center; background-color: #f9f9f9; padding: 20px;">
        <h1>Seu QR Code para realizar Checkin</h1>
        <p>Use o QR Code abaixo para acessar:</p>
        <img src=${qrcodeUrl} alt="QR Code" style="width: 200px; height: 200px;" />
      </body>
      </html>`,
  });

  if (error) {
    console.error({ error });
  }
};

const genQrCode = async (
  data: { email: string; id: string },
  redirectUrl: string
) => {
  const outDirPath = path.resolve(__dirname, "../files");
  const filepath = outDirPath.concat(`/${data.id}.png`);
  const stream = fs.createWriteStream(filepath);

  await QrCode.toFileStream(stream, redirectUrl);
  const serveQrcodeUrl = APP_URL.concat(`/checkin/qrcode/${data.id}`);
  qrcodesFilepaths.push({ id: data.id, filepath });

  await fetchQrCode(serveQrcodeUrl, [data.email]);
};

fastify.route({
  url: "/checkin/qrcode/:id",
  method: "GET",
  schema: {
    querystring: {
      type: "object",
      properties: { id: { type: "string" } },
    },
  },
  handler: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    reply.header("Content-Type", "image/png");
    const qrcodeToServe = qrcodesFilepaths.find((qrPath) => qrPath.id === id);
    if (!qrcodeToServe) {
      throw new Error("QrCode not found!");
    }

    return reply.send(fs.createReadStream(qrcodeToServe.filepath));
  },
});

const addUserSchema = z.array(
  z.object({
    name: z.string(),
    email: z.string().email(),
    stage: z.string(),
  })
);

fastify.route({
  url: "/checkin/add-user",
  method: "POST",
  handler: async (request: FastifyRequest, reply: FastifyReply) => {
    const parseData = addUserSchema.parse(request.body);
    for (const checkin of parseData) {
      const usedData = checkinDb.find((checkin) => checkin.id === checkin.id);
      if (!usedData) {
        const checkinId = nanoid();
        toDoCheckin.push({
          ...checkin,
          status: "AUSENTE",
          arrived_at: "",
          id: checkinId,
        });

        mountRedirectUrl(checkinId, APP_URL).then((redirectUrl) => {
          genQrCode({ email: checkin.email, id: checkinId }, redirectUrl);
        });
      }
    }
  },
});

fastify.route({
  url: "/checkin/events",
  method: "GET",
  handler: async (request: FastifyRequest, reply: FastifyReply) => {
    const appHeaders = [...corsHeaders, ...sseHeaders];
    for (const { key, value } of appHeaders) {
      reply.raw.setHeader(key, value);
    }

    sseClients.push(reply);
    request.raw.on("close", () => {
      const index = sseClients.indexOf(reply);
      if (index !== -1) {
        sseClients.splice(index, 1);
      }
    });

    reply.raw.write("data: Connection has been stablished!\n\n");
  },
});

const notifyClients = async (data: CheckIn[]) => {
  sseClients.forEach((_checkinClient) => {
    _checkinClient.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  });
};

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
  handler: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const index = toDoCheckin.findIndex((checkin) => checkin.id === id);

    if (index !== -1) {
      const currentData = toDoCheckin[index];
      if (currentData.status === "AUSENTE") {
        currentData.status = "PRESENTE";
        currentData.arrived_at = new Date().toISOString();
        checkinDb.push({
          ...currentData,
        });
      }
    }

    await notifyClients(checkinDb);
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
          if (proxyUrl !== null) {
            APP_URL = proxyUrl;
          }

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
