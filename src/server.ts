import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import ngrok from "@ngrok/ngrok";
import { nanoid } from "nanoid";
import QrCode from "qrcode-terminal";
const fastify = Fastify({ logger: true });

interface LifeshaperUrl {
  name: string;
  tmp_url: string;
}

const lifeshaperUrl: LifeshaperUrl[] = [];
fastify.route({
  method: "GET",
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
  handler: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    reply.send("<h1>Registrado</h1>");
  },
});

async function mountRedirectUrl(data: any, appUrl: string) {
  const currentDataId = nanoid();
  const uniqueUrl = `${appUrl}/checkin/${currentDataId}`;
  lifeshaperUrl.push({ name: data.name, tmp_url: uniqueUrl });

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
        class: "Shapers",
        class_date: "2024-11-28T10:00:00",
        status: "PRESENTE",
        arrived_at: null,
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
