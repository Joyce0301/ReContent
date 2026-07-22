export class AuthConfigurationError extends Error {
  constructor(message = "Authentication configuration is incomplete.") {
    super(message);
    this.name = "AuthConfigurationError";
  }
}

export class AuthStorageUnavailableError extends Error {
  constructor(
    message = "Authentication storage is unavailable.",
    options?: { cause?: unknown }
  ) {
    super(message);
    this.name = "AuthStorageUnavailableError";

    if (options && "cause" in options) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}
