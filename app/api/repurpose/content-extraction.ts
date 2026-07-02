import { load } from "cheerio";

type Fetcher = typeof fetch;

type ExtractionOptions = {
  fetcher?: Fetcher;
  timeoutMs?: number;
};

export type ExtractionSource = "site_specific" | "jina_reader" | "html";
export type ExtractionOutcome = "success" | "failed" | "skipped";
export type ExtractionFailureReason =
  | "invalid_url"
  | "timeout"
  | "network_error"
  | "http_error"
  | "no_content"
  | "unsupported_site";

export type ExtractionAttempt = {
  source: ExtractionSource;
  outcome: ExtractionOutcome;
  failureReason?: ExtractionFailureReason;
};

export type ExtractionDiagnostics = {
  url: string;
  normalizedUrl: string | null;
  finalSource?: ExtractionSource;
  finalOutcome: "success" | "failure";
  attempts: ExtractionAttempt[];
};

type ExtractionResult = {
  content: string | null;
  diagnostics: ExtractionDiagnostics;
};

type AttemptResult = {
  text: string | null;
  attempt: ExtractionAttempt;
};

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

const MIN_MEANINGFUL_LENGTH = 80;
const MIN_EXTRACTED_LENGTH = 200;
const MAX_EXTRACTED_LENGTH = 20000;
const DEFAULT_FETCH_TIMEOUT_MS = 6000;
const CONSERVATIVE_RETRY_TIMEOUT_MULTIPLIER = 2;

export async function extractContentFromUrl(
  url: string,
  options: ExtractionOptions = {}
): Promise<string | null> {
  const result = await extractContentFromUrlWithDiagnostics(url, options);
  return result.content;
}

export async function extractContentFromUrlWithDiagnostics(
  url: string,
  options: ExtractionOptions = {}
): Promise<ExtractionResult> {
  const normalizedUrl = normalizeHttpUrl(url);
  if (!normalizedUrl) {
    return {
      content: null,
      diagnostics: {
        url,
        normalizedUrl: null,
        finalOutcome: "failure",
        attempts: [
          {
            source: "site_specific",
            outcome: "skipped",
            failureReason: "invalid_url"
          }
        ]
      }
    };
  }

  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const diagnostics: ExtractionDiagnostics = {
    url,
    normalizedUrl,
    finalOutcome: "failure",
    attempts: []
  };

  const siteSpecificResult = await fetchSiteSpecificContent(normalizedUrl, fetcher, timeoutMs);
  diagnostics.attempts.push(siteSpecificResult.attempt);
  const siteSpecificText = siteSpecificResult.text;
  if (isUsefulText(siteSpecificText) || isMeaningfulText(siteSpecificText)) {
    const content = cleanExtractedText(siteSpecificText).slice(0, MAX_EXTRACTED_LENGTH);
    diagnostics.finalOutcome = "success";
    diagnostics.finalSource = "site_specific";
    return { content, diagnostics };
  }

  const parsedUrl = new URL(normalizedUrl);
  const jinaPromise = fetchWithJinaReader(normalizedUrl, fetcher, timeoutMs);
  const htmlPromise = fetchAndExtractHtml(normalizedUrl, fetcher, timeoutMs);
  const prioritizeHtmlForThisUrl = isLikelyListingPath(parsedUrl);

  if (prioritizeHtmlForThisUrl) {
    const htmlResult = await htmlPromise;
    diagnostics.attempts.push(htmlResult.attempt);

    if (htmlResult.text) {
      diagnostics.finalOutcome = "success";
      diagnostics.finalSource = "html";
      return { content: htmlResult.text, diagnostics };
    }

    const jinaResult = await jinaPromise;
    diagnostics.attempts.push(jinaResult.attempt);

    if (isUsefulText(jinaResult.text) || isMeaningfulText(jinaResult.text)) {
      const content = cleanExtractedText(jinaResult.text).slice(0, MAX_EXTRACTED_LENGTH);
      diagnostics.finalOutcome = "success";
      diagnostics.finalSource = "jina_reader";
      return { content, diagnostics };
    }

    const retryResult = await retryHtmlExtractionIfTransientFailure(
      normalizedUrl,
      diagnostics,
      fetcher,
      timeoutMs
    );
    if (retryResult) {
      return retryResult;
    }

    return { content: null, diagnostics };
  }

  const firstCompleted = await Promise.race([
    jinaPromise.then(result => ({ source: "jina_reader" as const, result })),
    htmlPromise.then(result => ({ source: "html" as const, result }))
  ]);

  if (firstCompleted.source === "jina_reader") {
    diagnostics.attempts.push(firstCompleted.result.attempt);

    if (isUsefulText(firstCompleted.result.text)) {
      if (looksLikeListingContent(firstCompleted.result.text)) {
        const htmlResult = await htmlPromise;
        diagnostics.attempts.push(htmlResult.attempt);

        if (shouldPreferHtmlResultOverJina(htmlResult.text, firstCompleted.result.text)) {
          diagnostics.finalOutcome = "success";
          diagnostics.finalSource = "html";
          return { content: htmlResult.text, diagnostics };
        }
      }

      const content = cleanExtractedText(firstCompleted.result.text).slice(
        0,
        MAX_EXTRACTED_LENGTH
      );
      diagnostics.finalOutcome = "success";
      diagnostics.finalSource = "jina_reader";
      return { content, diagnostics };
    }

    const htmlResult = await htmlPromise;
    diagnostics.attempts.push(htmlResult.attempt);

    if (htmlResult.text) {
      diagnostics.finalOutcome = "success";
      diagnostics.finalSource = "html";
      return { content: htmlResult.text, diagnostics };
    }

    if (isMeaningfulText(firstCompleted.result.text)) {
      const content = cleanExtractedText(firstCompleted.result.text).slice(
        0,
        MAX_EXTRACTED_LENGTH
      );
      diagnostics.finalOutcome = "success";
      diagnostics.finalSource = "jina_reader";
      return { content, diagnostics };
    }

    const retryResult = await retryHtmlExtractionIfTransientFailure(
      normalizedUrl,
      diagnostics,
      fetcher,
      timeoutMs
    );
    if (retryResult) {
      return retryResult;
    }

    return { content: null, diagnostics };
  }

  diagnostics.attempts.push(firstCompleted.result.attempt);

  if (firstCompleted.result.text) {
    diagnostics.finalOutcome = "success";
    diagnostics.finalSource = "html";
    return { content: firstCompleted.result.text, diagnostics };
  }

  const jinaResult = await jinaPromise;
  diagnostics.attempts.push(jinaResult.attempt);

  if (isUsefulText(jinaResult.text) || isMeaningfulText(jinaResult.text)) {
    const content = cleanExtractedText(jinaResult.text).slice(0, MAX_EXTRACTED_LENGTH);
    diagnostics.finalOutcome = "success";
    diagnostics.finalSource = "jina_reader";
    return { content, diagnostics };
  }

  const retryResult = await retryHtmlExtractionIfTransientFailure(
    normalizedUrl,
    diagnostics,
    fetcher,
    timeoutMs
  );
  if (retryResult) {
    return retryResult;
  }

  return { content: null, diagnostics };
}

async function retryHtmlExtractionIfTransientFailure(
  url: string,
  diagnostics: ExtractionDiagnostics,
  fetcher: Fetcher,
  timeoutMs: number
): Promise<ExtractionResult | null> {
  if (!shouldRetryHtmlExtraction(diagnostics)) {
    return null;
  }

  const retryResult = await fetchAndExtractHtml(
    url,
    fetcher,
    timeoutMs * CONSERVATIVE_RETRY_TIMEOUT_MULTIPLIER
  );
  diagnostics.attempts.push(retryResult.attempt);

  if (!retryResult.text) {
    return null;
  }

  diagnostics.finalOutcome = "success";
  diagnostics.finalSource = "html";
  return {
    content: retryResult.text,
    diagnostics
  };
}

function shouldRetryHtmlExtraction(diagnostics: ExtractionDiagnostics) {
  const htmlAttempts = diagnostics.attempts.filter(attempt => attempt.source === "html");
  if (htmlAttempts.length === 0) {
    return false;
  }

  if (htmlAttempts.some(attempt => attempt.outcome === "success")) {
    return false;
  }

  const transientFailureDetected = diagnostics.attempts.some(
    attempt =>
      attempt.failureReason === "timeout" || attempt.failureReason === "network_error"
  );

  return transientFailureDetected;
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
  fetcher: Fetcher,
  timeoutMs: number
): Promise<AttemptResult> {
  try {
    const res = await fetchWithTimeout(fetcher, `https://r.jina.ai/${url}`, timeoutMs, {
      headers: {
        "User-Agent": USER_AGENT
      }
    });
    if (!res.ok) {
      return {
        text: null,
        attempt: {
          source: "jina_reader",
          outcome: "failed",
          failureReason: "http_error"
        }
      };
    }

    const text = cleanExtractedText(await res.text());
    const hasAccessChallenge = looksLikeAccessChallengeText(text, {
      source: "jina_reader",
      url
    });
    return {
      text: hasAccessChallenge ? null : text,
      attempt: {
        source: "jina_reader",
        outcome:
          !hasAccessChallenge && isMeaningfulText(text) ? "success" : "failed",
        failureReason:
          !hasAccessChallenge && isMeaningfulText(text) ? undefined : "no_content"
      }
    };
  } catch (error) {
    return {
      text: null,
      attempt: {
        source: "jina_reader",
        outcome: "failed",
        failureReason: toFailureReason(error)
      }
    };
  }
}

async function fetchAndExtractHtml(
  url: string,
  fetcher: Fetcher,
  timeoutMs: number
): Promise<AttemptResult> {
  try {
    const res = await fetchWithTimeout(fetcher, url, timeoutMs, {
      headers: {
        "User-Agent": USER_AGENT
      }
    });
    if (!res.ok) {
      return {
        text: null,
        attempt: {
          source: "html",
          outcome: "failed",
          failureReason: "http_error"
        }
      };
    }

    const html = await res.text();
    const $ = load(html);

    const parsedUrl = new URL(url);
    const pageTitle = $("title").text().trim();
    let text = "";
    let metadataText = "";
    let preferredMetadataSummary = false;

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
      text = extractKnownSiteContent($, parsedUrl, pageTitle);
    }

    if (!isUsefulText(text)) {
      text = extractHydrationDataText($, pageTitle);
    }

    if (!isUsefulText(text)) {
      text = extractInlineScriptDataText($, pageTitle);
    }

    if (!isUsefulText(text)) {
      metadataText = extractStructuredMetadataText($, pageTitle);
      text = metadataText;
    }

    $("script, style, noscript, nav, footer, aside, form, iframe, header, dialog").remove();

    if (!isUsefulText(text)) {
      const blockText = findBestTextBlock($);
      const paragraphClusterText = findBestParagraphCluster($);
      const shouldPreferParagraphCluster =
        isUsefulText(paragraphClusterText) && hasStructuralNoise(blockText);
      const shouldPreferMetadata =
        isSummaryLikeText(metadataText) &&
        isLikelyListingPage($, parsedUrl, blockText, paragraphClusterText);

      preferredMetadataSummary = shouldPreferMetadata;

      text =
        shouldPreferMetadata
          ? metadataText
          : shouldPreferParagraphCluster ||
              scoreTextBlock(paragraphClusterText) > scoreTextBlock(blockText)
          ? paragraphClusterText
          : blockText;
    }

    const cleaned = cleanExtractedText(text, pageTitle);
    if (
      looksLikeAccessChallengeText(cleaned, {
        source: "html",
        url
      })
    ) {
      return {
        text: null,
        attempt: {
          source: "html",
          outcome: "failed",
          failureReason: "no_content"
        }
      };
    }

    const acceptedShortContent =
      isMeaningfulText(cleaned) ||
      (preferredMetadataSummary && isSummaryLikeText(cleaned));

    if (!isUsefulText(cleaned) && !acceptedShortContent) {
      return {
        text: null,
        attempt: {
          source: "html",
          outcome: "failed",
          failureReason: "no_content"
        }
      };
    }

    return {
      text: cleaned.slice(0, MAX_EXTRACTED_LENGTH),
      attempt: {
        source: "html",
        outcome: "success"
      }
    };
  } catch (error) {
    return {
      text: null,
      attempt: {
        source: "html",
        outcome: "failed",
        failureReason: toFailureReason(error)
      }
    };
  }
}

async function fetchSiteSpecificContent(
  url: string,
  fetcher: Fetcher,
  timeoutMs: number
): Promise<AttemptResult> {
  const joinQqText = await fetchJoinQqPostDetail(url, fetcher, timeoutMs);
  if (joinQqText.text) {
    return joinQqText;
  }

  if (joinQqText.attempt.outcome === "success") {
    return joinQqText;
  }

  return {
    text: null,
    attempt: {
      source: "site_specific",
      outcome: "skipped",
      failureReason: "unsupported_site"
    }
  };
}

async function fetchJoinQqPostDetail(
  url: string,
  fetcher: Fetcher,
  timeoutMs: number
): Promise<AttemptResult> {
  const parsedUrl = new URL(url);
  if (parsedUrl.hostname !== "join.qq.com" || parsedUrl.pathname !== "/post_detail.html") {
    return {
      text: null,
      attempt: {
        source: "site_specific",
        outcome: "skipped",
        failureReason: "unsupported_site"
      }
    };
  }

  const postId = parsedUrl.searchParams.get("postid");
  if (!postId) {
    return {
      text: null,
      attempt: {
        source: "site_specific",
        outcome: "failed",
        failureReason: "no_content"
      }
    };
  }

  try {
    const timedRes = await fetchWithTimeout(
      fetcher,
      `https://join.qq.com/api/v1/jobDetails/getJobDetailsByPostId?postId=${encodeURIComponent(postId)}`,
      timeoutMs,
      {
        headers: {
          "User-Agent": USER_AGENT,
          "X-Requested-With": "XMLHttpRequest"
        }
      }
    );

    if (!timedRes.ok) {
      return {
        text: null,
        attempt: {
          source: "site_specific",
          outcome: "failed",
          failureReason: "http_error"
        }
      };
    }

    const payload = (await timedRes.json()) as {
      status?: number;
      data?: {
        title?: string;
        tidName?: string;
        projectName?: string;
        introduction?: string;
        desc?: string;
        request?: string;
        internBonus?: string | null;
        graduateBonus?: string | null;
        recruitCityList?: string[];
        workCityList?: string[];
        intentionBGDList?: Array<{
          showTitle?: string;
          showTxt?: string;
        }>;
      };
    };

    if (payload.status !== 0 || !payload.data) {
      return {
        text: null,
        attempt: {
          source: "site_specific",
          outcome: "failed",
          failureReason: "no_content"
        }
      };
    }

    const detail = payload.data;
    const departmentSummary = (detail.intentionBGDList ?? [])
      .map(item => [item.showTitle, item.showTxt].filter(Boolean).join(" "))
      .filter(Boolean)
      .join("\n");

    return {
      text: cleanExtractedText(
      [
        detail.title,
        [detail.tidName, detail.projectName].filter(Boolean).join(" "),
        detail.introduction,
        detail.desc ? `岗位描述\n${detail.desc}` : "",
        detail.request ? `岗位要求\n${detail.request}` : "",
        detail.internBonus ? `加分项或注意事项\n${detail.internBonus}` : "",
        detail.graduateBonus &&
        detail.graduateBonus !== detail.internBonus
          ? `加分项或注意事项\n${detail.graduateBonus}`
          : "",
        detail.recruitCityList?.length
          ? `参加面试的城市\n${detail.recruitCityList.join("、")}`
          : "",
        detail.workCityList?.length ? `工作地点\n${detail.workCityList.join("、")}` : "",
        departmentSummary ? `招聘部门和工作地\n${departmentSummary}` : ""
      ]
        .filter(Boolean)
        .join("\n\n")
      ),
      attempt: {
        source: "site_specific",
        outcome: "success"
      }
    };
  } catch (error) {
    return {
      text: null,
      attempt: {
        source: "site_specific",
        outcome: "failed",
        failureReason: toFailureReason(error)
      }
    };
  }
}

function findBestTextBlock($: ReturnType<typeof load>): string {
  const candidates = [
    "article",
    "main",
    "[role='main']",
    "#js_content",
    ".rich_media_content",
    ".RichContent-inner",
    ".RichText",
    ".Post-RichText",
    "#content_views",
    "#content",
    ".content",
    ".post",
    ".article",
    ".article-body",
    ".post-body",
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
    if ($(el).find("article, main, [role='main']").length > 0) {
      continue;
    }

    const text = $(el).text().trim();
    const score = scoreTextBlock(text);
    if (score > bestScore) {
      best = text;
      bestScore = score;
    }
  }

  return best;
}

function extractKnownSiteContent(
  $: ReturnType<typeof load>,
  parsedUrl: URL,
  pageTitle?: string
): string {
  const hostname = parsedUrl.hostname.toLowerCase();

  if (hostname === "mp.weixin.qq.com") {
    return extractContainerText(
      $,
      "#js_content",
      [
        "#activity-name",
        ".rich_media_title",
        "meta[property='og:title']",
        "title"
      ],
      pageTitle
    );
  }

  if (hostname.endsWith("zhihu.com")) {
    return extractContainerText(
      $,
      ".Post-RichText, .RichText, .RichContent-inner",
      ["h1", "meta[property='og:title']", "title"],
      pageTitle
    );
  }

  if (hostname.endsWith("juejin.cn")) {
    return extractContainerText(
      $,
      "article, .article, .markdown-body",
      ["h1", "meta[property='og:title']", "title"],
      pageTitle
    );
  }

  if (hostname.endsWith("csdn.net")) {
    return extractContainerText(
      $,
      "#content_views, article, .article_content",
      ["h1", "title"],
      pageTitle
    );
  }

  return "";
}

function extractStructuredMetadataText(
  $: ReturnType<typeof load>,
  pageTitle?: string
): string {
  const jsonLdText = extractJsonLdText($, pageTitle);
  if (isUsefulText(jsonLdText) || isMeaningfulText(jsonLdText)) {
    return cleanExtractedText(jsonLdText, pageTitle);
  }

  const metaCandidates = [
    $("meta[property='og:title']").attr("content"),
    $("meta[name='twitter:title']").attr("content"),
    $("meta[name='description']").attr("content"),
    $("meta[property='og:description']").attr("content"),
    $("meta[name='twitter:description']").attr("content")
  ]
    .map(value => value?.trim() ?? "")
    .filter(Boolean);

  const uniqueMeta = Array.from(new Set(metaCandidates));
  if (uniqueMeta.length === 0) {
    return "";
  }

  return cleanExtractedText(uniqueMeta.join("\n\n"), pageTitle);
}

function extractHydrationDataText(
  $: ReturnType<typeof load>,
  pageTitle?: string
): string {
  const texts: string[] = [];
  const selectors = [
    "script#__NEXT_DATA__",
    "script#__NUXT_DATA__",
    "script[data-hypernova-key]",
    "script[type='application/json']"
  ];

  for (const selector of selectors) {
    for (const script of $(selector).toArray()) {
      const raw = $(script).contents().text().trim();
      if (!raw) {
        continue;
      }

      const parsed = safelyParseJsonLd(raw);
      collectHydrationText(parsed, texts);
    }
  }

  if (texts.length === 0) {
    return "";
  }

  const deduped = Array.from(new Set(texts));
  return cleanExtractedText(deduped.join("\n\n"), pageTitle);
}

function extractInlineScriptDataText(
  $: ReturnType<typeof load>,
  pageTitle?: string
): string {
  const texts: string[] = [];
  const markers = [
    "__INITIAL_STATE__",
    "__NUXT__",
    "__APOLLO_STATE__",
    "__data",
    "__STATE__",
    "_sharedData",
    "__PRELOADED_STATE__"
  ];

  for (const script of $("script").toArray()) {
    const raw = $(script).contents().text().trim();
    if (!raw || raw.length < 40) {
      continue;
    }

    for (const marker of markers) {
      const extractedJson = extractAssignedJson(raw, marker);
      if (!extractedJson) {
        continue;
      }

      const parsed = safelyParseJsonLd(extractedJson);
      collectHydrationText(parsed, texts);
    }
  }

  if (texts.length === 0) {
    return "";
  }

  return cleanExtractedText(Array.from(new Set(texts)).join("\n\n"), pageTitle);
}

function extractJsonLdText($: ReturnType<typeof load>, pageTitle?: string): string {
  const texts: string[] = [];

  for (const script of $("script[type='application/ld+json']").toArray()) {
    const raw = $(script).contents().text().trim();
    if (!raw) {
      continue;
    }

    const parsed = safelyParseJsonLd(raw);
    const items = Array.isArray(parsed) ? parsed : [parsed];

    for (const item of items) {
      collectJsonLdText(item, texts);
    }
  }

  if (texts.length === 0) {
    return "";
  }

  return cleanExtractedText(Array.from(new Set(texts)).join("\n\n"), pageTitle);
}

function safelyParseJsonLd(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function collectJsonLdText(value: unknown, texts: string[]) {
  if (!value) {
    return;
  }

  if (typeof value === "string") {
    if (value.trim().length > 0) {
      texts.push(value.trim());
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectJsonLdText(item, texts);
    }
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;

  const candidates = [
    record.headline,
    record.name,
    record.description,
    record.articleBody,
    record.text
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      texts.push(candidate.trim());
    }
  }

  if (record["@graph"] && Array.isArray(record["@graph"])) {
    for (const child of record["@graph"]) {
      collectJsonLdText(child, texts);
    }
  }

  for (const nestedValue of Object.values(record)) {
    if (nestedValue && typeof nestedValue === "object") {
      collectJsonLdText(nestedValue, texts);
    }
  }
}

function collectHydrationText(value: unknown, texts: string[]) {
  if (!value) {
    return;
  }

  if (typeof value === "string") {
    const cleaned = cleanExtractedText(value);
    if (looksLikeHydrationContent(cleaned)) {
      texts.push(cleaned);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectHydrationText(item, texts);
    }
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;

  const prioritizedKeys = [
    "articleBody",
    "content",
    "body",
    "text",
    "description",
    "excerpt",
    "summary",
    "title",
    "headline",
    "name"
  ];

  for (const key of prioritizedKeys) {
    if (key in record) {
      collectHydrationText(record[key], texts);
    }
  }

  for (const nestedValue of Object.values(record)) {
    if (nestedValue && typeof nestedValue === "object") {
      collectHydrationText(nestedValue, texts);
    }
  }
}

function extractAssignedJson(raw: string, marker: string) {
  const markerIndex = raw.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  const equalsIndex = raw.indexOf("=", markerIndex);
  if (equalsIndex < 0) {
    return null;
  }

  const startIndex = findFirstJsonToken(raw, equalsIndex + 1);
  if (startIndex < 0) {
    return null;
  }

  return extractBalancedJson(raw, startIndex);
}

function findFirstJsonToken(raw: string, startIndex: number) {
  for (let index = startIndex; index < raw.length; index += 1) {
    const char = raw[index];
    if (char === "{" || char === "[") {
      return index;
    }
    if (!/\s|;/.test(char)) {
      break;
    }
  }

  return -1;
}

function extractBalancedJson(raw: string, startIndex: number) {
  const stack: string[] = [];
  let inString = false;
  let escapeNext = false;

  for (let index = startIndex; index < raw.length; index += 1) {
    const char = raw[index];

    if (inString) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        escapeNext = true;
        continue;
      }

      if (char === "\"") {
        inString = false;
      }

      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      stack.push(char);
      continue;
    }

    if (char === "}" || char === "]") {
      const opening = stack.pop();
      if (!opening) {
        return null;
      }

      if (
        (opening === "{" && char !== "}") ||
        (opening === "[" && char !== "]")
      ) {
        return null;
      }

      if (stack.length === 0) {
        return raw.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

function findBestParagraphCluster($: ReturnType<typeof load>): string {
  const roots = [
    "article",
    "main",
    "[role='main']",
    ".content",
    ".post",
    ".article",
    ".article-body",
    ".post-body",
    ".entry-content",
    ".post-content",
    ".article-content",
    ".rich-text",
    ".markdown-body",
    "section",
    "div"
  ];

  let best = "";
  let bestScore = 0;

  for (const selector of roots) {
    for (const el of $(selector).toArray()) {
      if (looksLikeNoiseContainer($, el)) {
        continue;
      }

      const paragraphs = $(el)
        .find("p, li")
        .toArray()
        .map(node => $(node).text().trim())
        .map(text => cleanExtractedText(text))
        .filter(text => text.length >= 40);

      if (paragraphs.length < 2) {
        continue;
      }

      const text = paragraphs.join("\n\n");
      const score = scoreTextBlock(text);
      if (score > bestScore) {
        best = text;
        bestScore = score;
      }
    }
  }

  return best;
}

function scoreTextBlock(text: string): number {
  const cleaned = cleanExtractedText(text);
  if (cleaned.length < 80) return 0;

  const paragraphCount = cleaned.split(/\n+/).filter(p => p.length > 40).length;
  const punctuationCount = (cleaned.match(/[。！？.!?]/g) ?? []).length;
  const noiseMatches =
    cleaned.match(/\b(home|pricing|docs|login|sign in|register|menu)\b/gi)?.length ?? 0;

  return cleaned.length + paragraphCount * 120 + punctuationCount * 20 - noiseMatches * 80;
}

function extractContainerText(
  $: ReturnType<typeof load>,
  containerSelector: string,
  titleSelectors: string[],
  pageTitle?: string
) {
  const title = extractTitleFromSelectors($, titleSelectors);
  const blocks = $(containerSelector)
    .find("p, li, h2, h3, blockquote")
    .toArray()
    .map(node => $(node).text().trim())
    .map(text => cleanExtractedText(text))
    .filter(text => text.length >= 18);

  if (blocks.length === 0) {
    return "";
  }

  return cleanExtractedText(
    [title || pageTitle || "", blocks.join("\n\n")].filter(Boolean).join("\n\n"),
    pageTitle
  );
}

function extractTitleFromSelectors($: ReturnType<typeof load>, selectors: string[]) {
  for (const selector of selectors) {
    if (selector.startsWith("meta[")) {
      const content = $(selector).attr("content")?.trim();
      if (content) {
        return content;
      }
      continue;
    }

    const text = $(selector).first().text().trim();
    if (text) {
      return text;
    }
  }

  return "";
}

function looksLikeNoiseContainer($: ReturnType<typeof load>, element: unknown) {
  const node = $(element as never);
  const attrText = [node.attr("class"), node.attr("id"), node.attr("role")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /(nav|menu|footer|header|sidebar|breadcrumb|comment|related|share)/.test(
    attrText
  );
}

function hasStructuralNoise(text: string) {
  const cleaned = cleanExtractedText(text).toLowerCase();

  return /(about careers contact terms privacy|home products docs pricing login|sign in|all rights reserved)/.test(
    cleaned
  );
}

function looksLikeHydrationContent(text: string) {
  if (text.length < 80) {
    return false;
  }

  const punctuationCount = (text.match(/[。！？.!?]/g) ?? []).length;
  const wordLikeCount =
    text
      .split(/\s+/)
      .map(part => part.trim())
      .filter(Boolean).length || 0;

  return punctuationCount >= 2 || wordLikeCount >= 20;
}

function isSummaryLikeText(text: string | null) {
  if (!text) {
    return false;
  }

  const cleaned = cleanExtractedText(text);
  if (cleaned.length < 90) {
    return false;
  }

  const sentenceCount = (cleaned.match(/[。！？.!?]/g) ?? []).length;
  const lineCount = cleaned
    .split(/\n+/)
    .map(part => part.trim())
    .filter(Boolean).length;

  return sentenceCount >= 1 || lineCount >= 2;
}

function isLikelyListingPage(
  $: ReturnType<typeof load>,
  parsedUrl: URL,
  blockText: string,
  paragraphClusterText: string
) {
  const listingPath = isLikelyListingPath(parsedUrl);

  const articleCount = $("article").length;
  const headingCount = $("h2, h3").length;
  const cleanedBlock = cleanExtractedText(blockText).toLowerCase();
  const cleanedCluster = cleanExtractedText(paragraphClusterText).toLowerCase();
  const hasArchiveSignals =
    /(older posts|latest news|read more|view all|latest articles)/.test(cleanedBlock) ||
    /(older posts|latest news|read more|view all|latest articles)/.test(
      cleanedCluster
    );

  return listingPath || articleCount >= 3 || headingCount >= 8 || hasArchiveSignals;
}

function isLikelyListingPath(parsedUrl: URL) {
  const pathname = parsedUrl.pathname.replace(/\/+$/, "") || "/";
  return (
    pathname === "/" ||
    /^(page\/\d+|tag\/|category\/|topics?\/|search)/.test(pathname.slice(1))
  );
}

function looksLikeListingContent(text: string | null) {
  if (!text) {
    return false;
  }

  const cleaned = cleanExtractedText(text).toLowerCase();
  const shortLineCount = cleaned
    .split(/\n+/)
    .map(line => line.trim())
    .filter(line => line.length >= 8 && line.length <= 90).length;
  const archiveSignals =
    (cleaned.match(/older posts|latest news|read more|view all|recent posts/g) ?? [])
      .length;

  return archiveSignals >= 1 || shortLineCount >= 12;
}

function looksLikeAccessChallengeText(
  text: string | null,
  context: { source: ExtractionSource; url: string }
) {
  if (!text) {
    return false;
  }

  const cleaned = cleanExtractedText(text).toLowerCase();
  const hostname = (() => {
    try {
      return new URL(context.url).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  const isWeChatUrl = hostname === "mp.weixin.qq.com";
  const hasWeChatReaderMarker =
    cleaned.includes("weixin official accounts platform") ||
    cleaned.includes("url source: https://mp.weixin.qq.com/") ||
    cleaned.includes("mp.weixin.qq.com/s/");
  const hasVerificationMarker =
    cleaned.includes("环境异常") ||
    cleaned.includes("完成验证后即可继续访问") ||
    cleaned.includes("去验证");
  const hasCaptchaMarker =
    cleaned.includes("requiring captcha") || cleaned.includes("captcha");

  if (context.source === "jina_reader") {
    return (
      isWeChatUrl &&
      hasWeChatReaderMarker &&
      hasVerificationMarker &&
      (hasCaptchaMarker || cleaned.length < 800)
    );
  }

  return isWeChatUrl && hasVerificationMarker && hasCaptchaMarker && cleaned.length < 1200;
}

function shouldPreferHtmlResultOverJina(htmlText: string | null, jinaText: string | null) {
  if (!htmlText) {
    return false;
  }

  const cleanedHtml = cleanExtractedText(htmlText);
  const cleanedJina = cleanExtractedText(jinaText);

  if (cleanedHtml.length === 0) {
    return false;
  }

  if (!looksLikeListingContent(cleanedJina)) {
    return false;
  }

  return !looksLikeListingContent(cleanedHtml) || cleanedHtml.length < cleanedJina.length;
}

function toFailureReason(error: unknown): ExtractionFailureReason {
  if (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.message.toLowerCase().includes("aborted"))
  ) {
    return "timeout";
  }

  if (
    error instanceof Error &&
    (error.message.toLowerCase().includes("timeout") ||
      error.message.toLowerCase().includes("timed out"))
  ) {
    return "timeout";
  }

  return "network_error";
}

function cleanExtractedText(text: string | null, pageTitle?: string): string {
  if (!text) return "";

  const noisePatterns = [
    /百度首页|登录|注册|贴吧|知道|网盘|图片|视频|地图|文库|资讯|采购|帮助/g,
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

function isMeaningfulText(text: string | null): text is string {
  if (!text) return false;

  const cleaned = cleanExtractedText(text);
  if (cleaned.length < MIN_MEANINGFUL_LENGTH) {
    return false;
  }

  const paragraphCount = cleaned
    .split(/\n+/)
    .map(part => part.trim())
    .filter(part => part.length >= 20).length;
  const sentenceCount = (cleaned.match(/[。！？.!?]/g) ?? []).length;

  return paragraphCount >= 2 || sentenceCount >= 2;
}

async function fetchWithTimeout(
  fetcher: Fetcher,
  input: string,
  timeoutMs: number,
  init: RequestInit
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetcher(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}
