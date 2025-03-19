import { FastifyReply, FastifyRequest } from "fastify";
import { IUserRepository } from "../../repository/user/user-repository.interface";
import z from "zod";
import jwt from "jsonwebtoken";
import {} from "bcrypt";

const loginSchema = z.object({
  email: z.string().email(),
});

export function generateToken(
  expiresIn: "1h" | "30d",
  payload: string,
  secretOrPrivateKey: string
) {
  return jwt.sign({ id: payload }, secretOrPrivateKey, {
    expiresIn,
    algorithm: "HS256",
  });
}

export class LoginHandler {
  constructor(private dbRepository: IUserRepository) {}
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const { email } = loginSchema.parse(request.body);
    const user = await this.dbRepository.getByEmail(email);

    if (!user)
      return reply.status(401).send({ message: "Credenciais inválidas" });

    if (!process.env.JWT_SECRET)
      return reply.status(500).send({ message: "Erro Interno" });

    const accessToken = generateToken("1h", user.id, process.env.JWT_SECRET);
    const refreshToken = generateToken("30d", user.id, process.env.JWT_SECRET);

    reply.raw.setHeader(
      "Set-Cookie",
      `refreshToken=${refreshToken}; HttpOnly; Secure; SameSite=Strict; Path=/auth/refresh; Max-Age=2592000`
    );

    return reply.status(200).send({ access_token: accessToken });
  }
}
