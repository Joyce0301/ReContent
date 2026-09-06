import { NextResponse } from "next/server";
import { getAuthSession, isAuthServiceError } from "../../lib/auth/session";
import { readBoundedJson } from "../../lib/http/bounded-json";
import { listDraftsByUserId, saveDraftForUser } from "../../lib/drafts/store";
import type { WorkspaceDraftSnapshot } from "../../lib/drafts/types";
import { rememberDraftForUser } from "../../lib/knowledge/store";
import { CampaignNotFoundError, requireCampaignForUser } from "../../lib/campaigns/store";
import { isCampaignId } from "../../lib/campaigns/types";

type DraftRequestBody = WorkspaceDraftSnapshot & {
  draftId?: string;
};

const MAX_DRAFT_REQUEST_BYTES = 256 * 1024;
const MAX_SOURCE_URL_LENGTH = 2048;

function isPlatformKey(value: unknown): value is DraftRequestBody["selectedPlatform"] {
  return value === "twitter" || value === "linkedin" || value === "xiaohongshu";
}

function isInputMode(value: unknown): value is DraftRequestBody["inputMode"] {
  return value === "text" || value === "url";
}

function isToneKey(value: unknown): value is DraftRequestBody["tone"] {
  return value === "neutral" || value === "formal" || value === "casual";
}

function isRepurposeResultArray(value: unknown): value is DraftRequestBody["results"] {
  return (
    Array.isArray(value) &&
    value.every(
      item =>
        typeof item === "object" &&
        item !== null &&
        isPlatformKey((item as { platform?: unknown }).platform) &&
        typeof (item as { content?: unknown }).content === "string" &&
        (
          (item as { title?: unknown }).title === undefined ||
          typeof (item as { title?: unknown }).title === "string"
        )
    )
  );
}

function validateDraftBody(value: unknown): DraftRequestBody | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const body = value as Record<string, unknown>;
  if (body.campaignId !== undefined && body.campaignId !== null && !isCampaignId(body.campaignId)) return null;

  if (
    body.draftId !== undefined &&
    typeof body.draftId !== "string"
  ) {
    return null;
  }

  if (
    !isInputMode(body.inputMode) ||
    typeof body.sourceText !== "string" ||
    typeof body.sourceUrl !== "string" ||
    !isPlatformKey(body.selectedPlatform) ||
    !isToneKey(body.tone) ||
    typeof body.customInstruction !== "string" ||
    !isRepurposeResultArray(body.results)
  ) {
    return null;
  }

  if (body.sourceUrl.length > MAX_SOURCE_URL_LENGTH) {
    return null;
  }

  if (
    body.activePlatform !== null &&
    body.activePlatform !== undefined &&
    !isPlatformKey(body.activePlatform)
  ) {
    return null;
  }

  return {
    ...(body.campaignId !== undefined ? { campaignId: body.campaignId as string | null } : {}),
    draftId: body.draftId,
    inputMode: body.inputMode,
    sourceText: body.sourceText,
    sourceUrl: body.sourceUrl,
    selectedPlatform: body.selectedPlatform,
    tone: body.tone,
    customInstruction: body.customInstruction,
    results: body.results,
    activePlatform: body.activePlatform ?? null
  };
}

async function requireSession() {
  const session = await getAuthSession();

  if (!session) {
    return null;
  }

  return session;
}

function logStorageError(operation: "list" | "save", error: unknown) {
  const failure = error as { name?: string; cause?: { code?: string; errno?: number } };
  // MySQL error messages and SQL can contain draft text; log identifiers only.
  console.error("draft storage unavailable", {
    operation,
    name: failure.name,
    code: failure.cause?.code,
    errno: failure.cause?.errno
  });
}

export async function GET(request?: Request) {
  try {
    const session = await requireSession();

    if (!session) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const offset = Number(request ? new URL(request.url).searchParams.get("offset") ?? 0 : 0);
    if (!Number.isSafeInteger(offset) || offset < 0) {
      return NextResponse.json({ error: "历史分页参数不合法" }, { status: 400 });
    }
    const campaignId = request ? new URL(request.url).searchParams.get("campaignId") : null;
    if (campaignId !== null && !isCampaignId(campaignId)) return NextResponse.json({ error: "活动 ID 不合法" }, { status: 400 });
    if (campaignId) await requireCampaignForUser(campaignId, session.user.id);
    const drafts = campaignId
      ? await listDraftsByUserId(session.user.id, offset, campaignId)
      : await listDraftsByUserId(session.user.id, offset);
    return NextResponse.json({ drafts: drafts.slice(0, 20), nextOffset: drafts.length > 20 ? offset + 20 : null });
  } catch (error) {
    if (error instanceof CampaignNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (isAuthServiceError(error)) {
      logStorageError("list", error);
      return NextResponse.json(
        { error: "草稿服务暂时不可用，请稍后再试。" },
        { status: 503 }
      );
    }

    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();

    if (!session) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const bodyResult = await readBoundedJson(request, MAX_DRAFT_REQUEST_BYTES);

    if (!bodyResult.ok) {
      return NextResponse.json({ error: "草稿请求体不合法" }, { status: 400 });
    }

    const body = validateDraftBody(bodyResult.value);

    if (!body) {
      return NextResponse.json({ error: "草稿内容格式错误" }, { status: 400 });
    }

    const draft = await saveDraftForUser({
      draftId: body.draftId,
      userId: session.user.id,
      snapshot: {
        ...(body.campaignId !== undefined ? { campaignId: body.campaignId } : {}),
        inputMode: body.inputMode,
        sourceText: body.sourceText,
        sourceUrl: body.sourceUrl,
        selectedPlatform: body.selectedPlatform,
        tone: body.tone,
        customInstruction: body.customInstruction,
        results: body.results,
        activePlatform: body.activePlatform
      }
    });

    void rememberDraftForUser({ userId: session.user.id, draft }).catch(error => {
      console.warn("knowledge indexing skipped", error);
    });

    return NextResponse.json({ draft });
  } catch (error) {
    if (error instanceof CampaignNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (isAuthServiceError(error)) {
      logStorageError("save", error);
      return NextResponse.json(
        { error: "草稿服务暂时不可用，请稍后再试。" },
        { status: 503 }
      );
    }

    throw error;
  }
}
