export interface JobPort {
  dispatch(name: string, payload: unknown): Promise<void>;
}

export class InlineJobPort implements JobPort {
  async dispatch(): Promise<void> {}
}
