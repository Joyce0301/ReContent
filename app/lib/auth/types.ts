import type { AvatarStatus } from "../avatar/types";

export type AuthUserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  avatarKey: string | null;
  avatarStatus: AvatarStatus;
  avatarUpdatedAt: string | null;
  createdAt: string;
};

export type AuthSessionRecord = {
  id: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
};

export type AuthSessionUser = {
  id: string;
  email: string;
  displayName: string;
  avatarKey: string | null;
  avatarStatus: AvatarStatus;
  avatarUpdatedAt: string | null;
};

export type AuthSessionPayload = {
  sessionId: string;
  expiresAt: string;
};

export type AuthSession = {
  user: AuthSessionUser;
  expiresAt: string;
};
