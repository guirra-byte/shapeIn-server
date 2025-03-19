import { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { generateToken } from "./login-handlers";

export class RefreshTokenHandler {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const refreshToken = request.headers.cookie?.split("refreshToken=")[1];

    if (!refreshToken) {
      return reply.status(401).send({ message: "Token inválido" });
    }

    if (!process.env.JWT_SECRET) return reply.status(500).send();
    jwt.verify(refreshToken, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        return reply.status(403).send({ message: "Token inválido" });
      }

      if (decoded && process.env.JWT_SECRET) {
        const { id } = decoded as { id: string };
        const newAccessToken = generateToken("1h", id, process.env.JWT_SECRET);

        reply.status(200).send({ access_token: newAccessToken });
      }
    });
  }
}
