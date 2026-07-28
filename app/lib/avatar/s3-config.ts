import "server-only";

import { AvatarStorageConfigurationError } from "./storage-errors";

export type AvatarS3Config = {
  bucket: string;
  region: string;
};

export function getAvatarS3Config(): AvatarS3Config {
  const bucket = process.env.AVATAR_S3_BUCKET;
  const region = process.env.AWS_REGION;

  if (!bucket?.trim() || !region?.trim()) {
    throw new AvatarStorageConfigurationError();
  }

  return { bucket, region };
}
