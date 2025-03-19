import { User } from "../../types/user.interface";

export interface IUserRepository {
  save(data: User): Promise<void>;
  getById(id: string): Promise<User | null>;
  getByEmail(email: string): Promise<User | null>;
  update(newStatus: User): Promise<void>;
}
