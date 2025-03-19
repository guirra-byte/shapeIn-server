import { FastifyReply, FastifyRequest } from "fastify";
import { IUserRepository } from "../repository/user/user-repository.interface";
import { SseNotifyHandler } from "./sse-client.handler";

export class CheckinHandler {
  constructor(
    private db: IUserRepository,
    private sseNotifyHandler: SseNotifyHandler
  ) {}
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const user = await this.db.getById(id);

    if (!user) return;
    if (user.status === "AUSENTE") {
      const newData = {
        ...user,
        status: "PRESENTE",
        arrived_at: new Date().toISOString(),
      };

      await this.sseNotifyHandler.execute({
        type: "checkin",
        payload: newData,
      });
      
      await this.db.update(newData);
    }
  }
}
