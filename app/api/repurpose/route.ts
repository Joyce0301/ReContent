import { NextResponse } from "next/server";
import OpenAI from "openai";
import { load } from "cheerio";

type PlatformKey = "twitter" | "linkedin" | "xiaohongshu";

type RequestBody = {
  mode: "text" | "url";
  text?: string;
  url?: string;
  platforms: PlatformKey[];
  tone: "neutral" | "formal" | "casual";
};

const openaiApiKey = process.env.OPENAI_API_KEY;
const deepseekApiKey = process.env.DEEPSEEK_API_KEY;

const openai = openaiApiKey
  ? new OpenAI({
      apiKey: openaiApiKey
    })
  : null;
const deepseek = deepseekApiKey
  ? new OpenAI({
      apiKey: deepseekApiKey,
      baseURL: "https://api.deepseek.com/v1"
    })
  : null;

export async function POST(req: Request) {
  let body: RequestBody;

  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
  }

  if (!body.platforms || body.platforms.length === 0) {
    return NextResponse.json({ error: "至少选择一个目标平台" }, { status: 400 });
  }

  if (body.mode === "text") {
    if (!body.text || body.text.trim().length === 0) {
      return NextResponse.json(
        { error: "请输入要重制的文本内容" },
        { status: 400 }
      );
    }
  } else if (body.mode === "url") {
    if (!body.url || body.url.trim().length === 0) {
      return NextResponse.json({ error: "请输入 URL" }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: "不支持的输入模式" }, { status: 400 });
  }

  try {
    const sourceContent =
      body.mode === "text"
        ? body.text!.trim()
        : await fetchAndExtractText(body.url!);

    if (!sourceContent) {
      return NextResponse.json(
        { error: "未能从内容中提取文本，请检查链接是否可访问" },
        { status: 400 }
      );
    }

    let results;
    if (deepseek) {
      results = await generateWithDeepSeek(sourceContent, body.platforms, body.tone);
    } else if (openai) {
      results = await generateWithOpenAI(sourceContent, body.platforms, body.tone);
    } else {
      results = generateMockResults(sourceContent, body.platforms, body.tone);
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("repurpose error:", error);
    const errorMessage = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json(
      { error: `生成过程中出现错误: ${errorMessage}` },
      { status: 500 }
    );
  }
}

async function fetchAndExtractText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36"
      }
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = load(html);
    $("script, style, noscript").remove();

    const u = new URL(url);
    let text = "";

    if (u.hostname.includes("baike.baidu.com")) {
      const title =
        $(".lemmaWgt-lemmaTitle .lemmaWgt-lemmaTitle-title h1").text().trim() ||
        $("h1").first().text().trim();
      const summary = $(".lemma-summary").text().trim();
      const paras = $(".para")
        .toArray()
        .map(el => $(el as any).text().trim())
        .filter(Boolean)
        .join("\n");
      text = [title, summary, paras].join("\n").trim();
    }

    if (!text || text.length < 200) {
      const candidates = [
        "article",
        "main",
        "#content",
        ".content",
        ".post",
        ".entry-content",
        ".rich-text",
        ".markdown-body",
        ".lemma-summary",
        ".lemma-main",
        ".mw-parser-output"
      ];
      let best = "";
      for (const sel of candidates) {
        const t = $(sel).text().trim();
        if (t && t.length > best.length) best = t;
      }
      if (!best) {
        const blocks = $("div, section").toArray();
        for (const el of blocks) {
          const t = $(el as any).text().trim();
          if (t && t.length > best.length) best = t;
        }
      }
      text = best;
    }

    const noisePatterns = [
      /百度首页|登录|注册|贴吧|知道|网盘|图片|视频|地图|文库|资讯|采购|百科|帮助/g,
      /©\s*\d{4}.*Baidu.*/g
    ];
    let cleaned = text;
    for (const pat of noisePatterns) {
      cleaned = cleaned.replace(pat, " ");
    }
    cleaned = cleaned.replace(/\s{2,}/g, " ").trim();

    const pageTitle = $("title").text().trim();
    const normalizedTitle =
      pageTitle
        .split(/[_\-｜|]/)
        .map((s: string) => s.trim())
        .filter(Boolean)[0] || pageTitle;
    if (normalizedTitle && !cleaned.startsWith(normalizedTitle)) {
      cleaned = `${normalizedTitle}\n\n${cleaned}`;
    }

    return cleaned.slice(0, 20000);
  } catch {
    return null;
  }
}

async function generateWithOpenAI(
  source: string,
  platforms: PlatformKey[],
  tone: RequestBody["tone"]
) {
  const toneLabel =
    tone === "formal" ? "正式商务" : tone === "casual" ? "轻松口语" : "中性专业";

  const systemPrompt =
    "你是一个专业的中英双语内容营销编辑，擅长根据不同平台的规则重写内容。输出必须是严格的 JSON 格式。";

  const userPrompt = `
原始长内容如下（可能为中文或英文）：
---
${source.slice(0, 8000)}
---

请基于上述内容，按以下平台和要求生成重制内容：

- Twitter / X 推文串：每条不超过 280 字，3-8 条，适当使用 emoji 和标签，适合作为线程阅读。
- LinkedIn 帖子：1 篇 800-1500 字左右的长帖，结构清晰，有开头引子、主体要点和结尾 CTA。
- 小红书笔记：1 篇中文笔记，包含一个有吸引力的标题（不超过 20 字）和正文（300-800 字），正文适当分段、使用 emoji 和标签。

通用要求：
- 整体语气风格：${toneLabel}
- 保留原文的核心观点和数据，但用更适合社交平台的方式表达。
- 不要虚构数据来源。

现在需要你只返回 JSON，格式如下（只保留被请求的平台）：
{
  "results": [
    {
      "platform": "twitter",
      "content": "推文 1\\n\\n推文 2 ..."
    },
    {
      "platform": "linkedin",
      "content": "LinkedIn 帖子完整内容 ..."
    },
    {
      "platform": "xiaohongshu",
      "title": "小红书标题",
      "content": "小红书正文 ..."
    }
  ]
}

注意：
- 一定只返回 JSON，不要出现任何解释或多余文字。
- 字段名必须是英文。
`;

  const response = await openai!.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.7,
    response_format: { type: "json_object" }
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("OpenAI 返回为空");
  }

  const parsed = JSON.parse(raw) as {
    results: {
      platform: PlatformKey;
      title?: string;
      content: string;
    }[];
  };

  const filtered = parsed.results.filter(r => platforms.includes(r.platform));

  return filtered;
}

async function generateWithDeepSeek(
  source: string,
  platforms: PlatformKey[],
  tone: RequestBody["tone"]
) {
  const toneLabel =
    tone === "formal" ? "正式商务" : tone === "casual" ? "轻松口语" : "中性专业";

  const systemPrompt =
    "你是一个专业的中英双语内容营销编辑，擅长根据不同平台的规则重写内容。你必须只返回 JSON 格式的内容，不要包含任何 Markdown 代码块包裹或解释性文字。";

  const userPrompt = `
原始长内容如下（可能为中文或英文）：
---
${source.slice(0, 8000)}
---

请基于上述内容，按以下平台和要求生成重制内容：

- Twitter / X 推文串：每条不超过 280 字，3-8 条，适当使用 emoji 和标签，适合作为线程阅读。
- LinkedIn 帖子：1 篇 800-1500 字左右的长帖，结构清晰，有开头引子、主体要点和结尾 CTA。
- 小红书笔记：1 篇中文笔记，包含一个有吸引力的标题（不超过 20 字）和正文（300-800 字），正文适当分段、使用 emoji 和标签。

通用要求：
- 整体语气风格：${toneLabel}
- 保留原文的核心观点和数据，但用更适合社交平台的方式表达。
- 不要虚构数据来源。

现在需要你只返回 JSON，格式如下（只保留被请求的平台）：
{
  "results": [
    {
      "platform": "twitter",
      "content": "推文 1\\n\\n推文 2 ..."
    },
    {
      "platform": "linkedin",
      "content": "LinkedIn 帖子完整内容 ..."
    },
    {
      "platform": "xiaohongshu",
      "title": "小红书标题",
      "content": "小红书正文 ..."
    }
  ]
}

注意：
- 字段名必须是英文。
- 只返回 JSON 字符串本身，不要包含 \`\`\`json 标记。
`;

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${deepseekApiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek API 响应错误: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as any;
    const raw = data.choices?.[0]?.message?.content;
    
    if (!raw) {
      throw new Error("DeepSeek 返回内容为空");
    }

    // 预处理：移除可能出现的 Markdown 标记
    const cleanedJson = raw.replace(/```json/g, "").replace(/```/g, "").trim();
    
    const parsed = JSON.parse(cleanedJson) as {
      results: {
        platform: PlatformKey;
        title?: string;
        content: string;
      }[];
    };

    return parsed.results.filter(r => platforms.includes(r.platform));
  } catch (err) {
    console.error("DeepSeek generation error:", err);
    throw err;
  }
}
function generateMockResults(
  source: string,
  platforms: PlatformKey[],
  tone: RequestBody["tone"]
) {
  const cleanedSource = source.replace(/\s{2,}/g, " ").trim();
  const short = cleanedSource.slice(0, 300);
  const baseIntro =
    short.length < cleanedSource.length ? `${short}...` : short || "（示例占位内容）";
  const sentences = cleanedSource
    .split(/(?<=[。.!?？!])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 8)
    .slice(0, 5);

  const toneLabel =
    tone === "formal" ? "【正式风格示例】" : tone === "casual" ? "【轻松风格示例】" : "【中性风格示例】";

  return platforms.map(platform => {
    if (platform === "twitter") {
      return {
        platform,
        content: `${toneLabel}
推文 1️⃣
${baseIntro}

推文 2️⃣
${sentences[0] || "提炼核心观点，突出对读者的直接价值。"} #AI #内容

推文 3️⃣
${sentences[1] || "给出一个可执行的小技巧，降低行动门槛。"}

推文 4️⃣
${sentences[2] || "补充案例或数据支持，增强可信度。"}

推文 5️⃣
更多细节见原文链接或评论区，欢迎交流。`
      };
    }

    if (platform === "linkedin") {
      return {
        platform,
        content: `${toneLabel}
【引子】
${baseIntro}

【主体】
- ${sentences[0] || "关键要点一：用简洁语言呈现结论与影响。"}
- ${sentences[1] || "关键要点二：补充案例或数据做支撑。"}
- ${sentences[2] || "关键要点三：提出实操步骤或检查清单。"}

【结尾 CTA】
欢迎在评论区分享你的实践经验，或点击原文获取完整细节。`
      };
    }

    return {
      platform,
      title: "示例：把一篇长文拆成高转化小红书笔记",
      content: `${toneLabel}
📌 开头：${baseIntro}

✨ 要点：
• ${sentences[0] || "用通俗语言讲清一个核心观点"}
• ${sentences[1] || "补充一个案例或数据让内容更可信"}
• ${sentences[2] || "给出一个立刻能做的小步骤"}

✅ 行动：
今天就按步骤试一次，评论区告诉我你的效果！

#自媒体 #内容创作 #AI工具`
    };
  });
}
