import { FastifyReply, FastifyRequest } from "fastify";
import { IUserRepository } from "../repository/user/user-repository.interface";
import { IFormRepository } from "../repository/user/form-repository.interface";

export class GoogleFormsAnswersHandler {
  constructor(private db: IUserRepository & IFormRepository) {}
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const { form_id } = request.params as { form_id: string };

    const form = await this.db.get(form_id);
    if (!form) throw new Error("Formulário não encontrado!");
    return form;
  }
}
