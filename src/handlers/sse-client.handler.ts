import { FastifyReply, FastifyRequest } from "fastify";

const corsHeaders: { key: string; value: string }[] = [
  { key: "Access-Control-Allow-Origin", value: "*" },
  { key: "Access-Control-Allow-Methods", value: "*" },
];
const sseHeaders: { key: string; value: string }[] = [
  { key: "Content-Type", value: "text/event-stream" },
  { key: "Cache-Control", value: "no-cache" },
  { key: "Connection", value: "keep-alive" },
];

type Chunk = {
  type: "new_user" | "checkin";
  payload: any;
};

class SseClientHandler {
  private static INSTANCE: SseClientHandler;
  public static get instance() {
    if (!this.INSTANCE) this.INSTANCE = new SseClientHandler();
    return this.INSTANCE;
  }

  private _clients: Record<"new_user" | "checkin", FastifyReply[]> = {
    new_user: [],
    checkin: [],
  };

  protected clients(type?: "new_user" | "checkin") {
    if (type) return this._clients[type];
    return [...this._clients["new_user"], ...this._clients["checkin"]];
  }

  protected async notifyClients(chunk: Chunk) {
    this._clients[chunk.type].map((client) => {
      client.raw.write(`data: ${JSON.stringify(chunk.payload)}\n\n`);
    });
  }

  protected async handle(request: FastifyRequest, reply: FastifyReply) {
    const sseClientType = (request.params as { type: "new_user" | "checkin" })
      .type;

    if (!sseClientType) {
      reply.code(400).send("Missing SSE type param!");
      return;
    }

    const rawHeaders = [...corsHeaders, ...sseHeaders];
    rawHeaders.map((header) => {
      reply.raw.setHeader(header.key, header.value);
    });

    this._clients[sseClientType].push(reply);
    request.raw.on("close", () => {
      const position = this._clients[sseClientType].indexOf(reply);
      if (position !== -1) this._clients[sseClientType].splice(position, 1);
    });

    reply.raw.write(
      `data: Connection with ${sseClientType} SSE has been stablished!\n\n`
    );
  }
}

class SseHandshakeHandler extends SseClientHandler {
  async execute(request: FastifyRequest, reply: FastifyReply) {
    super.handle(request, reply);
  }
}

class SseNotifyHandler extends SseClientHandler {
  async execute(chunk: Chunk) {
    super.notifyClients(chunk);
  }
}

export { SseNotifyHandler, SseHandshakeHandler };
