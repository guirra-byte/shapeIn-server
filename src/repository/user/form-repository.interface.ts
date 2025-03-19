export interface IFormRepository {
  set(key: string, answers: string): Promise<void>;
  get(key: string): Promise<string>;
}
