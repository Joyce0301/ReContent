import { NextResponse } from "next/server";
import { queryOne } from "../../../lib/auth/db";
import {
  AuthConfigurationError,
  AuthStorageUnavailableError
} from "../../../lib/auth/errors";

export async function GET() {
  try {
    await queryOne("SELECT 1 AS ok", []);

    return NextResponse.json({
      database: "ok",
      ok: true
    });
  } catch (error) {
    if (
      error instanceof AuthConfigurationError ||
      error instanceof AuthStorageUnavailableError
    ) {
      return NextResponse.json(
        {
          database: "error",
          message: error.message,
          ok: false
        },
        { status: 503 }
      );
    }

    throw error;
  }
}
