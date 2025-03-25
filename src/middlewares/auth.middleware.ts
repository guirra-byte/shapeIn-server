import { FastifyReply, FastifyRequest } from "fastify";
import { verify } from "jsonwebtoken";
import { IUserRepository } from "../repository/user/user-repository.interface";

export class AuthMiddleware {
  constructor(private dbRepository: IUserRepository) {}
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const privateKey = process.env.JWT_SECRET;
    if (!privateKey) throw new Error("Private Key is undefined!");

    const authHeader = request.headers.authorization as string;
    const [, token] = authHeader.split(" ");
    const payload = verify(token, privateKey) as string;
    const user = await this.dbRepository.getById(payload);

    if (!user) return new Error("User is undefined!");
    return true;
  }
}
