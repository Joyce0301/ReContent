import { redirect } from "next/navigation";

import { AuthServiceUnavailable } from "../components/auth/auth-service-unavailable";
import {
  AuthConfigurationError,
  AuthStorageUnavailableError
} from "../lib/auth/errors";
import { getAuthSession } from "../lib/auth/session";
import { ProfileView } from "./profile-view";

export default async function ProfilePage() {
  let authUnavailable = false;
  let session = null;

  try {
    session = await getAuthSession();
  } catch (error) {
    if (
      error instanceof AuthConfigurationError ||
      error instanceof AuthStorageUnavailableError
    ) {
      authUnavailable = true;
    } else {
      throw error;
    }
  }

  if (authUnavailable) {
    return <AuthServiceUnavailable title="个人资料暂时不可用" />;
  }

  if (!session) {
    redirect("/auth");
  }

  return <ProfileView session={session} />;
}
