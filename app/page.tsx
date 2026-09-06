import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  FileText,
  FolderOpen,
  Menu,
  Workflow
} from "lucide-react";
import "./recontent.css";

const capabilities = [
  {
    title: "从一篇开始",
    label: "Your source",
    color: "mint",
    icon: FileText,
    detail: "一篇文章，一段思考。",
    text: "博客、脚本或文章链接，都是下一次创作的起点。",
    tags: ["文章", "文本", "URL"]
  },
  {
    title: "让内容走得更远",
    label: "New possibilities",
    color: "rose",
    icon: Workflow,
    detail: "同一个想法，不同的表达。",
    text: "为每个平台重新组织内容，保留观点，也融入语境。",
    tags: ["Twitter / X", "LinkedIn", "小红书"]
  },
  {
    title: "把灵感留下来",
    label: "Your collection",
    color: "blue",
    icon: FolderOpen,
    detail: "每一次创作，都值得接着写。",
    text: "保存原文与成稿，下次回来，从上次停下的地方继续。",
    tags: ["原始素材", "成稿", "草稿"]
  }
];

export default function RootPage() {
  return (
    <div className="recontent-theme landing-page">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <header className="site-header">
        <Link href="/" className="wordmark" aria-label="ReContent 首页">
          recontent.
        </Link>
        <nav className="desktop-nav" aria-label="主导航">
          <a href="#possibilities">产品</a>
          <a href="#workflow">创作流程</a>
          <a href="#questions">常见问题</a>
        </nav>
        <div className="header-actions">
          <Link className="login-link" href="/auth">
            登录
          </Link>
          <Link className="rc-button" href="/workspace">
            开始创作 <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <details className="mobile-nav">
            <summary aria-label="导航菜单">
              <Menu size={22} aria-hidden="true" />
            </summary>
            <nav aria-label="移动导航">
              <a href="#possibilities">产品</a>
              <a href="#workflow">创作流程</a>
              <a href="#questions">常见问题</a>
              <Link href="/auth">登录</Link>
            </nav>
          </details>
        </div>
      </header>
      <main id="main-content">
        <section className="landing-hero">
          <Image
            src="/branding/content-flow.png"
            alt=""
            fill
            priority
            sizes="100vw"
            className="hero-art"
          />
          <div className="hero-copy">
            <p className="hero-eyebrow">
              <span>创造更多可能</span> 从一个好想法开始{" "}
              <ArrowRight size={14} aria-hidden="true" />
            </p>
            <h1>ReContent</h1>
            <p className="hero-tagline">好内容，值得不止一次被看见。</p>
            <p className="hero-description">
              把一篇长内容，变成适合不同平台的新表达。
              <br />
              保留你的观点，让每一次创作都有新的可能。
            </p>
            <div className="hero-actions">
              <Link className="rc-button" href="/workspace">
                开始创作 <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <a className="rc-button secondary" href="#workflow">
                看看创作流程 <ArrowDown size={17} aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
        <div className="platform-band">
          <p>一个想法，更多表达</p>
          <div>
            <span>Twitter / X</span>
            <span>LinkedIn</span>
            <span>小红书</span>
          </div>
        </div>
        <section className="landing-section" id="possibilities">
          <div className="section-intro">
            <p className="rc-eyebrow">MADE FOR YOUR IDEAS</p>
            <h2>让创作，继续发生。</h2>
            <p>从原始素材到下一篇成稿，把时间留给真正值得表达的想法。</p>
          </div>
          <div className="capability-grid">
            {capabilities.map(
              ({ title, label, color, icon: Icon, detail, text, tags }) => (
                <Link
                  href="/workspace"
                  className={`capability ${color}`}
                  key={title}
                >
                  <div className="capability-heading">
                    <p>{label}</p>
                    <h3>{title}</h3>
                  </div>
                  <div className="capability-art" aria-hidden="true">
                    <Icon size={64} strokeWidth={1.1} />
                    <div className="capability-tags">
                      {tags.map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  </div>
                  <div className="capability-copy">
                    <h4>{detail}</h4>
                    <p>{text}</p>
                    <ArrowRight size={25} aria-hidden="true" />
                  </div>
                </Link>
              )
            )}
          </div>
        </section>
        <section className="workflow-section" id="workflow">
          <div className="workflow-heading">
            <div>
              <p className="rc-eyebrow">LESS REPETITION. MORE CREATION.</p>
              <h2>
                从好想法，
                <br />
                到下一次发布。
              </h2>
            </div>
            <Link className="text-link" href="/workspace">
              打开工作台 <ArrowRight size={19} aria-hidden="true" />
            </Link>
          </div>
          <div className="workflow-steps">
            <div>
              <span>01</span>
              <h3>放入原始素材</h3>
              <p>粘贴一段文本，或输入文章链接。</p>
            </div>
            <div>
              <span>02</span>
              <h3>选择这次的表达</h3>
              <p>选定一个平台，加入语气与个人风格。</p>
            </div>
            <div>
              <span>03</span>
              <h3>留下满意的成稿</h3>
              <p>检查、复制，或保存为草稿继续打磨。</p>
            </div>
          </div>
          <figure className="product-preview">
            <Image
              src="/branding/workspace-preview.png"
              alt="ReContent 工作台：左侧输入原文并选择平台，右侧阅读和复制成稿"
              width={1440}
              height={1277}
              sizes="(max-width: 760px) 100vw, 1200px"
            />
            <figcaption>你的内容，你的节奏。</figcaption>
          </figure>
        </section>
        <section className="faq-section landing-section" id="questions">
          <div>
            <p className="rc-eyebrow">A FEW GOOD QUESTIONS</p>
            <h2>
              创作之前，
              <br />
              你可能想知道。
            </h2>
          </div>
          <div className="faq-list">
            <details open>
              <summary>支持哪些内容和平台？</summary>
              <p>
                可以粘贴原文或输入公开文章链接，生成 Twitter / X
                推文串、LinkedIn 帖子或小红书笔记。每次生成一个选定平台的版本。
              </p>
            </details>
            <details>
              <summary>可以保留我的表达风格吗？</summary>
              <p>
                可以选择中性专业、正式商务或轻松口语，也可以填写个性化要求，补充受众、口吻和表达重点。
              </p>
            </details>
            <details>
              <summary>生成后会自动发布吗？</summary>
              <p>
                不会。成稿由你检查和复制；小红书草稿功能需要桌面浏览器扩展，也会先打开编辑页供你确认。
              </p>
            </details>
            <details>
              <summary>文章链接无法读取怎么办？</summary>
              <p>
                部分网页需要登录或限制访问。可以切换到文本输入，把原文粘贴到工作台后继续创作。
              </p>
            </details>
          </div>
        </section>
        <section className="closing-band">
          <p className="rc-eyebrow">YOUR NEXT CHAPTER</p>
          <h2>
            下一个好内容，
            <br />
            从你已有的想法开始。
          </h2>
          <Link href="/workspace" className="rc-button">
            开始创作 <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </section>
      </main>
      <footer className="site-footer">
        <Link href="/" className="wordmark">
          recontent.
        </Link>
        <p>好内容，值得再次被看见。</p>
        <a href="#main-content">回到顶部 ↑</a>
      </footer>
    </div>
  );
}
