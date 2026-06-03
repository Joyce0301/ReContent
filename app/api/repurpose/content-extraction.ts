import { load } from "cheerio";

type Fetcher = typeof fetch;

type ExtractionOptions = {
  fetcher?: Fetcher;
};

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

const MIN_EXTRACTED_LENGTH = 200;
const MAX_EXTRACTED_LENGTH = 20000;

export async function extractContentFromUrl(
  url: string,
  options: ExtractionOptions = {}
): Promise<string | null> {
  const normalizedUrl = normalizeHttpUrl(url);
  if (!normalizedUrl) return null;

  const fetcher = options.fetcher ?? fetch;
  const jinaText = await fetchWithJinaReader(normalizedUrl, fetcher);
  if (isUsefulText(jinaText)) {
    return cleanExtractedText(jinaText).slice(0, MAX_EXTRACTED_LENGTH);
  }

  return fetchAndExtractHtml(normalizedUrl, fetcher);
}

function normalizeHttpUrl(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

async function fetchWithJinaReader(
  url: string,
  fetcher: Fetcher
): Promise<string | null> {
  try {
    const res = await fetcher(`https://r.jina.ai/${url}`, {
      headers: {
        "User-Agent": USER_AGENT
      }
    });
    if (!res.ok) return null;
    return cleanExtractedText(await res.text());
  } catch {
    return null;
  }
}

async function fetchAndExtractHtml(
  url: string,
  fetcher: Fetcher
): Promise<string | null> {
  try {
    const res = await fetcher(url, {
      headers: {
        "User-Agent": USER_AGENT
      }
    });
    if (!res.ok) return null;

    const html = await res.text();
    const $ = load(html);
    $("script, style, noscript, nav, footer, aside, form, iframe").remove();

    const parsedUrl = new URL(url);
    const pageTitle = $("title").text().trim();
    let text = "";

    if (parsedUrl.hostname.includes("baike.baidu.com")) {
      const title =
        $(".lemmaWgt-lemmaTitle .lemmaWgt-lemmaTitle-title h1").text().trim() ||
        $("h1").first().text().trim();
      const summary = $(".lemma-summary").text().trim();
      const paras = $(".para")
        .toArray()
        .map(el => $(el).text().trim())
        .filter(Boolean)
        .join("\n");
      text = [title, summary, paras].join("\n").trim();
    }

    if (!isUsefulText(text)) {
      text = findBestTextBlock($);
    }

    const cleaned = cleanExtractedText(text, pageTitle);
    if (!isUsefulText(cleaned)) return null;

    return cleaned.slice(0, MAX_EXTRACTED_LENGTH);
  } catch {
    return null;
  }
}

function findBestTextBlock($: ReturnType<typeof load>): string {
  const candidates = [
    "article",
    "main",
    "#content",
    ".content",
    ".post",
    ".entry-content",
    ".post-content",
    ".article-content",
    ".rich-text",
    ".markdown-body",
    ".lemma-summary",
    ".lemma-main",
    ".mw-parser-output"
  ];

  let best = "";
  let bestScore = 0;

  for (const selector of candidates) {
    const text = $(selector).text().trim();
    const score = scoreTextBlock(text);
    if (score > bestScore) {
      best = text;
      bestScore = score;
    }
  }

  for (const el of $("div, section").toArray()) {
    const text = $(el).text().trim();
    const score = scoreTextBlock(text);
    if (score > bestScore) {
      best = text;
      bestScore = score;
    }
  }

  return best;
}

function scoreTextBlock(text: string): number {
  const cleaned = cleanExtractedText(text);
  if (cleaned.length < 80) return 0;

  const paragraphCount = cleaned.split(/\n+/).filter(p => p.length > 40).length;
  const punctuationCount = (cleaned.match(/[。！？.!?]/g) ?? []).length;

  return cleaned.length + paragraphCount * 120 + punctuationCount * 20;
}

function cleanExtractedText(text: string | null, pageTitle?: string): string {
  if (!text) return "";

  const noisePatterns = [
    /百度首页|登录|注册|贴吧|知道|网盘|图片|视频|地图|文库|资讯|采购|百科|帮助/g,
    /©\s*\d{4}.*Baidu.*/g,
    /^URL Source:.*$/gim,
    /^Markdown Content:.*$/gim
  ];

  let cleaned = text;
  for (const pattern of noisePatterns) {
    cleaned = cleaned.replace(pattern, " ");
  }

  cleaned = cleaned
    .replace(/\r/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const normalizedTitle = normalizePageTitle(pageTitle);
  if (normalizedTitle && !cleaned.startsWith(normalizedTitle)) {
    cleaned = `${normalizedTitle}\n\n${cleaned}`;
  }

  return cleaned;
}

function normalizePageTitle(pageTitle?: string): string {
  if (!pageTitle) return "";
  return (
    pageTitle
      .split(/[_\-｜|]/)
      .map(part => part.trim())
      .filter(Boolean)[0] || pageTitle.trim()
  );
}

function isUsefulText(text: string | null): text is string {
  return Boolean(text && cleanExtractedText(text).length >= MIN_EXTRACTED_LENGTH);
}
