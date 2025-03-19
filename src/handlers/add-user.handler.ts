import { FastifyRequest, FastifyReply } from "fastify";
import { IUserRepository } from "../repository/user/user-repository.interface";
import { SseNotifyHandler } from "./sse-client.handler";
import path from "node:path";
import fs from "node:fs";

import { toFileStream } from "qrcode";
import { nanoid } from "nanoid";
import z from "zod";

const addUserSchema = z.array(
  z.object({
    name: z.string(),
    email: z.string().email(),
    stage: z.string(),
  })
);

const genQrCode = async (data: { email: string; id: string }) => {
  const outDirPath = path.resolve(__dirname, "../files");
  const filepath = outDirPath.concat(`/${data.id}.png`);
  const stream = fs.createWriteStream(filepath);

  if (!process.env.APP_URL) throw new Error("APP_URL not found in .env file");

  const redirectUrl = process.env.APP_URL.concat(`/checkin/${data.id}`);
  await toFileStream(stream, redirectUrl, { type: "png" });

  return {
    id: data.id,
    url: redirectUrl,
  };
};

// Handler should be used to save users that payment was made;
export class AddUserBatchHandler {
  constructor(
    private db: IUserRepository,
    private sseNotifyHandler: SseNotifyHandler
  ) {}
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const reqData = addUserSchema.parse(request.body);
    const onProcessData = reqData.map(async (currentData) => {
      return new Promise(async (resolve, reject) => {
        try {
          const haveUser = await this.db.getByEmail(currentData.email);
          if (haveUser) throw new Error("User already exists!");

          const user = {
            ...currentData,
            status: "AUSENTE",
            arrived_at: "",
            id: nanoid(),
          };

          await genQrCode({ email: user.email, id: nanoid() });
          await this.db.save(user);
          resolve(user);
        } catch (error) {
          if (error instanceof Error) reject(error.message);
        }
      });
    });

    await Promise.allSettled(onProcessData).then((pData) => {
      pData.map((data) => {
        if (data.status === "fulfilled") {
          this.sseNotifyHandler.execute({
            payload: data.value,
            type: "new_user",
          });
        } else if (data.status === "rejected") {
          // reply.send(data.reason);
        }
      });
    });
  }
}
