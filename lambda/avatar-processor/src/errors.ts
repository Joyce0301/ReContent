export class AvatarProcessorError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AvatarProcessorError";
  }
}
