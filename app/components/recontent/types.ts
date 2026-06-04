export type PlatformKey = "twitter" | "linkedin" | "xiaohongshu";

export type InputMode = "text" | "url";

export type ToneKey = "neutral" | "formal" | "casual";

export type RepurposeResult = {
  platform: PlatformKey;
  title?: string;
  content: string;
};

export const PLATFORM_OPTIONS: Array<{
  key: PlatformKey;
  label: string;
  shortLabel: string;
  resultBadge: string;
}> = [
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

export const DEFAULT_SELECTED_PLATFORMS = PLATFORM_OPTIONS.map(
  option => option.key
);

export const PLATFORM_LABELS: Record<PlatformKey, string> = Object.fromEntries(
  PLATFORM_OPTIONS.map(option => [option.key, option.label])
) as Record<PlatformKey, string>;

export const PLATFORM_BADGES: Record<PlatformKey, string> = Object.fromEntries(
  PLATFORM_OPTIONS.map(option => [option.key, option.resultBadge])
) as Record<PlatformKey, string>;

export const TONE_OPTIONS: Array<{ key: ToneKey; label: string }> = [
  { key: "neutral", label: "中性专业" },
  { key: "formal", label: "正式商务" },
  { key: "casual", label: "轻松口语" }
];
