export type PlatformKey = "twitter" | "linkedin" | "xiaohongshu";

export type InputMode = "text" | "url";

export type ToneKey = "neutral" | "formal" | "casual";

export const MAX_CUSTOM_INSTRUCTION_LENGTH = 300;

export const PERSONALIZATION_EXAMPLES = [
  "更像创始人发言",
  "更故事化一点",
  "更适合创业者受众"
] as const;

export type RepurposeResult = {
  platform: PlatformKey;
  title?: string;
  content: string;
};

export type XiaohongshuDraftPayload = {
  sourceId: string;
  title: string;
  content: string;
  tags: string[];
};

export type XiaohongshuDraftBridgeStatus =
  | "idle"
  | "opening"
  | "filled"
  | "login_required"
  | "bridge_unavailable"
  | "unsupported_page"
  | "validation_error"
  | "failed";

export type XiaohongshuDraftBridgeResult = {
  status: XiaohongshuDraftBridgeStatus;
  message: string;
};

export type PlatformOption = {
  key: PlatformKey;
  label: string;
  shortLabel: string;
  resultBadge: string;
};

export const PLATFORM_OPTIONS: PlatformOption[] = [
  {
    key: "twitter",
    label: "Twitter / X 推文串",
    shortLabel: "X",
    resultBadge: "𝕏"
  },
  {
    key: "linkedin",
    label: "LinkedIn 帖子",
    shortLabel: "in",
    resultBadge: "in"
  },
  {
    key: "xiaohongshu",
    label: "小红书笔记",
    shortLabel: "小红书",
    resultBadge: "小"
  }
];

export const DEFAULT_SELECTED_PLATFORM: PlatformKey = PLATFORM_OPTIONS[0].key;

export const PLATFORM_LABELS: Record<PlatformKey, string> = Object.fromEntries(
  PLATFORM_OPTIONS.map(option => [option.key, option.label])
) as Record<PlatformKey, string>;

export const PLATFORM_BADGES: Record<PlatformKey, string> = Object.fromEntries(
  PLATFORM_OPTIONS.map(option => [option.key, option.resultBadge])
) as Record<PlatformKey, string>;

export const PLATFORM_SHORT_LABELS: Record<PlatformKey, string> =
  Object.fromEntries(
    PLATFORM_OPTIONS.map(option => [option.key, option.shortLabel])
  ) as Record<PlatformKey, string>;

export const TONE_OPTIONS: Array<{ key: ToneKey; label: string }> = [
  { key: "neutral", label: "中性专业" },
  { key: "formal", label: "正式商务" },
  { key: "casual", label: "轻松口语" }
];
