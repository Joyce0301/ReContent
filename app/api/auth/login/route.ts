import { NextResponse } from "next/server";
import {
  AuthConfigurationError,
  AuthStorageUnavailableError
} from "../../../lib/auth/errors";
import { verifyPassword } from "../../../lib/auth/password";
import { getClientAddress, consumeRateLimit } from "../../../lib/auth/rate-limit";
import { attachSessionCookieForUser, isAuthServiceError } from "../../../lib/auth/session";
import { findUserByEmail } from "../../../lib/auth/user-store";
import { validateLoginInput } from "../../../lib/auth/validation";

type LoginRequestBody = {
  email?: unknown;
  password?: unknown;
};

export async function POST(req: Request) {
  let body: LoginRequestBody;

  try {
    body = (await req.json()) as LoginRequestBody;
  } catch {
    return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
  }

  const validationResult = validateLoginInput(body);
  if (!validationResult.ok) {
    return NextResponse.json({ error: validationResult.error }, { status: 400 });
  }

  try {
    const rateLimit = consumeRateLimit({
      bucket: "auth-login",
      key: `${getClientAddress(req)}:${validationResult.value.email}`,
      max: 8,
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

    const user = await findUserByEmail(validationResult.value.email);
    if (!user) {
      return NextResponse.json(
        { error: "账号或密码不正确，请重新输入" },
        { status: 401 }
      );
    }

    const isValidPassword = await verifyPassword(
      validationResult.value.password,
      user.passwordHash
    );

    if (!isValidPassword) {
      return NextResponse.json(
        { error: "账号或密码不正确，请重新输入" },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName
      }
    });

    await attachSessionCookieForUser(response, user.id);
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
