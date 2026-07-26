export type AvatarStatus =
  | "not_uploaded"
  | "pending_upload"
  | "ready"
  | "failed";

const AVATAR_STATUSES: readonly AvatarStatus[] = [
  "not_uploaded",
  "pending_upload",
  "ready",
  "failed"
];

export function normalizeAvatarStatus(value: unknown): AvatarStatus {
  return AVATAR_STATUSES.includes(value as AvatarStatus)
    ? (value as AvatarStatus)
    : "not_uploaded";
}
