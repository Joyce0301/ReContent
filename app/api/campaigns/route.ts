import { NextResponse } from "next/server";
import { getAuthSession, isAuthServiceError } from "../../lib/auth/session";
import { readBoundedJson } from "../../lib/http/bounded-json";
import { CampaignNotFoundError, listCampaignsForUser, requireCampaignForUser, saveCampaignForUser } from "../../lib/campaigns/store";
import { isCampaignId, parseCampaignBrief } from "../../lib/campaigns/types";

async function handle(request: Request, method: "GET" | "POST" | "PATCH") {
  try {
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (method === "GET") {
      const params = new URL(request.url).searchParams;
      const id = params.get("id");
      if (id !== null) {
        if (!isCampaignId(id)) return NextResponse.json({ error: "活动 ID 不合法" }, { status: 400 });
        return NextResponse.json({ campaign: await requireCampaignForUser(id, session.user.id) });
      }
      const offset = Number(params.get("offset") ?? 0);
      if (!Number.isSafeInteger(offset) || offset < 0) return NextResponse.json({ error: "分页参数不合法" }, { status: 400 });
      const campaigns = await listCampaignsForUser(session.user.id, offset);
      return NextResponse.json({ campaigns: campaigns.slice(0, 20), nextOffset: campaigns.length > 20 ? offset + 20 : null });
    }
    const body = await readBoundedJson(request, 64 * 1024);
    const brief = body.ok ? parseCampaignBrief(body.value) : null;
    if (!brief) return NextResponse.json({ error: "请检查活动名称、目标、受众、核心信息和资料长度" }, { status: 400 });
    const id = (body.ok ? body.value as Record<string, unknown> : {}).id;
    if (method === "PATCH" && !isCampaignId(id)) return NextResponse.json({ error: "活动 ID 不合法" }, { status: 400 });
    const campaign = await saveCampaignForUser(session.user.id, brief, method === "PATCH" ? id as string : undefined);
    return NextResponse.json({ campaign }, { status: method === "POST" ? 201 : 200 });
  } catch (error) {
    if (error instanceof CampaignNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (isAuthServiceError(error)) {
      const failure = error as { name?: string; cause?: { code?: string } };
      console.error("campaign storage unavailable", { name: failure.name, code: failure.cause?.code });
      return NextResponse.json({ error: "活动服务暂时不可用，请稍后重试" }, { status: 503 });
    }
    throw error;
  }
}

export const GET = (request: Request) => handle(request, "GET");
export const POST = (request: Request) => handle(request, "POST");
export const PATCH = (request: Request) => handle(request, "PATCH");
