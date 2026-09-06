export const CAMPAIGN_LIMITS = {
  name: 100, goal: 500, audience: 500, keyMessage: 2000, cta: 500,
  sourceText: 12000, sourceUrl: 2048
} as const;

export type CampaignBrief = {
  name: string;
  goal: string;
  audience: string;
  keyMessage: string;
  cta: string;
  sourceText: string;
  sourceUrl: string;
};

export type Campaign = CampaignBrief & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export function isCampaignId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function parseCampaignBrief(value: unknown): CampaignBrief | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const brief = {} as CampaignBrief;
  for (const key of Object.keys(CAMPAIGN_LIMITS) as Array<keyof CampaignBrief>) {
    if (typeof input[key] !== "string" || input[key].length > CAMPAIGN_LIMITS[key]) return null;
    brief[key] = input[key].trim();
  }
  if (!brief.name || !brief.goal || !brief.audience || !brief.keyMessage) return null;
  if (brief.sourceUrl) {
    try {
      const url = new URL(brief.sourceUrl);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    } catch { return null; }
  }
  return brief;
}
