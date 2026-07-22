import { NextResponse } from "next/server";
import {
  AuthConfigurationError,
  AuthStorageUnavailableError
} from "../../../lib/auth/errors";
import { hashPassword } from "../../../lib/auth/password";
import { getClientAddress, consumeRateLimit } from "../../../lib/auth/rate-limit";
import {
  assertSessionConfiguration,
  attachSessionCookieForUser,
  isAuthServiceError
} from "../../../lib/auth/session";
import { createUser, findUserByEmail } from "../../../lib/auth/user-store";
import { validateRegistrationInput } from "../../../lib/auth/validation";

type RegisterRequestBody = {
  email?: unknown;
  password?: unknown;
  displayName?: unknown;
};

export async function POST(req: Request) {
  let body: RegisterRequestBody;

  try {
    body = (await req.json()) as RegisterRequestBody;
  } catch {
    return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
  }

  const validationResult = validateRegistrationInput(body);
  if (!validationResult.ok) {
    return NextResponse.json({ error: validationResult.error }, { status: 400 });
  }

  try {
    assertSessionConfiguration();

    const rateLimit = consumeRateLimit({
      bucket: "auth-register",
      key: `${getClientAddress(req)}:${validationResult.value.email}`,
      max: 5,
      windowMs: 10 * 60 * 1000
    });

    if (!rateLimit.ok) {
      return NextResponse.json(
        { error: "尝试次数过多，请稍后再试" },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds)
          }
        }
      );
    }

    const existingUser = await findUserByEmail(validationResult.value.email);
    if (existingUser) {
      return NextResponse.json(
        { error: "这个邮箱已经注册过了，请直接登录" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(validationResult.value.password);
    const createResult = await createUser({
      email: validationResult.value.email,
      passwordHash,
      displayName: validationResult.value.displayName
    });

    if (!createResult.ok) {
      return NextResponse.json(
        { error: "这个邮箱已经注册过了，请直接登录" },
        { status: 409 }
      );
    }

    const response = NextResponse.json({
      user: {
        id: createResult.value.id,
        email: createResult.value.email,
        displayName: createResult.value.displayName
      }
    });

    await attachSessionCookieForUser(response, createResult.value.id);
    return response;
  } catch (error) {
    if (isAuthServiceError(error)) {
      return NextResponse.json(
        {
          error:
            "当前环境还没有配置可用的认证数据库或会话密钥，请先完成 DATABASE_URL（或 MYSQL_*）与 AUTH_SESSION_SECRET 配置。"
        },
        { status: 503 }
      );
    }

    throw error;
  }
}
