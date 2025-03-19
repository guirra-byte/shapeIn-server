import { FastifyReply, FastifyRequest } from "fastify";
import { IUserRepository } from "../repository/user/user-repository.interface";
import { IFormRepository } from "../repository/user/form-repository.interface";
import { nanoid } from "nanoid";
import { SseNotifyHandler } from "./sse-client.handler";

type FormSubmissionProps = {
  id: string;
  sender: string;
  responses: Record<string, { label: string; answer: string }>;
  submittedAt: string;
};

export type FormProps = {
  id: string;
  sender: string;
  responses: { question: { key: string; label: string }; answer: string }[];
  submittedAt: string;
};

export class GoogleFormsWebhookHandler {
  constructor(
    private db: IFormRepository & IUserRepository,
    private sseNotifyHandler: SseNotifyHandler
  ) {}
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const data = request.body as string;
    const form = JSON.parse(data) as FormSubmissionProps;

    const currentSubmission: FormProps = {
      responses: [],
      id: form.id,
      sender: form.sender,
      submittedAt: form.submittedAt,
    };

    Object.entries(form.responses).map(([key, { label, answer }]) => {
      currentSubmission.responses.push({ question: { key, label }, answer });
    });

    new Promise(async (resolve, reject) => {
      try {
        await this.db.set(
          `google_forms:${form.id}`,
          JSON.stringify(currentSubmission)
        );

        resolve(currentSubmission);
      } catch (err) {
        reject(err);
      }
    })
      .then((value) => {
        this.sseNotifyHandler.execute({ type: "new_user", payload: value });
      })
      .catch((err) => {
        throw err;
      });
  }
}
