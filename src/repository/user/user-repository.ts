import { User } from "../../types/user.interface";
import { IUserRepository } from "./user-repository.interface";
import { createClient, RedisClientType } from "redis";

export class UserRepository implements IUserRepository {
  protected client: RedisClientType;

  private static INSTANCE: UserRepository;
  private constructor() {}
  public static get instance() {
    if (!this.INSTANCE) this.INSTANCE = new UserRepository();
    return this.INSTANCE;
  }

  async prepare() {
    if (!this.client) {
      this.client = createClient();
      await this.client.connect();
    }
  }

  async save(data: User): Promise<void> {
    const userData = JSON.stringify(data);
    await this.client.set(`email:${data.email}`, userData);
    await this.client.set(`id:${data.id}`, userData);
  }

  async getByEmail(email: string): Promise<User | null> {
    await this.prepare();
    const data = await this.client.get(`email:${email}`);
    return data ? (JSON.parse(data) as User) : null;
  }

  async getById(id: string): Promise<User | null> {
    await this.prepare();
    const data = await this.client.get(`id:${id}`);
    return data ? (JSON.parse(data) as User) : null;
  }

  async update(newData: User) {
    await this.prepare();
    const data = await this.client.get(`id:${newData.id}`);
    await this.save(data ? { ...JSON.parse(data), ...newData } : newData);
  }
}
