export class AvatarStorageConfigurationError extends Error {
  constructor() {
    super("Avatar storage is not configured");
    this.name = "AvatarStorageConfigurationError";
  }
}

export class AvatarStorageNotFoundError extends Error {
  constructor() {
    super("Avatar object was not found");
    this.name = "AvatarStorageNotFoundError";
  }
}

export class AvatarStoragePreconditionError extends Error {
  constructor() {
    super("Avatar object no longer matches the expected version");
    this.name = "AvatarStoragePreconditionError";
  }
}

export class AvatarStorageConflictError extends Error {
  constructor() {
    super("Avatar destination already exists");
    this.name = "AvatarStorageConflictError";
  }
}

export class AvatarStorageUnavailableError extends Error {
  constructor() {
    super("Avatar storage is temporarily unavailable");
    this.name = "AvatarStorageUnavailableError";
  }
}
