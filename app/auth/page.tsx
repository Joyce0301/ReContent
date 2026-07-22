import { AuthServiceUnavailable } from "../components/auth/auth-service-unavailable";
import { redirect } from "next/navigation";
import { AuthConfigurationError, AuthStorageUnavailableError } from "../lib/auth/errors";
import { AuthExperience } from "./auth-experience";
import { getAuthSession } from "../lib/auth/session";

export default async function AuthPage() {
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
    return <AuthServiceUnavailable />;
  }

  if (session) {
    redirect("/workspace");
  }

  return <AuthExperience />;
}
