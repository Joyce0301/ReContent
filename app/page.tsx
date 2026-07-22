import { AuthServiceUnavailable } from "./components/auth/auth-service-unavailable";
import { redirect } from "next/navigation";
import { AuthConfigurationError, AuthStorageUnavailableError } from "./lib/auth/errors";
import { getAuthSession } from "./lib/auth/session";

export default async function RootPage() {
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
    return <AuthServiceUnavailable title="认证服务暂时不可用" />;
  }

  redirect(session ? "/workspace" : "/auth");
}
