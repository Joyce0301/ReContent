"use client";

import Link from "next/link";
import { ArrowRight, ChevronDown, FileText, FolderOpen, Sparkles, Workflow, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type MenuLink = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  color: string;
};

type Menu = {
  label: string;
  eyebrow: string;
  heading: string;
  description: string;
  links: MenuLink[];
};

const menus: Menu[] = [
  {
    label: "产品",
    eyebrow: "RECONTENT / PRODUCT",
    heading: "让一份内容，拥有更多表达方式。",
    description: "从素材到成稿，把内容重新组织成适合不同平台的表达。",
    links: [
      {
        title: "内容重制",
        description: "从文章、文本或 URL 开始创作",
        href: "/workspace",
        icon: FileText,
        color: "mint"
      },
      {
        title: "营销活动",
        description: "围绕目标生成一组营销内容",
        href: "/workspace",
        icon: Sparkles,
        color: "rose"
      },
      {
        title: "个人内容库",
        description: "找回历史成稿，接着上次继续",
        href: "/workspace",
        icon: FolderOpen,
        color: "blue"
      }
    ]
  },
  {
    label: "创作流程",
    eyebrow: "RECONTENT / WORKFLOW",
    heading: "从一个想法，到可以发布的内容。",
    description: "三步完成一次内容重制，原文和结果都会自动保存。",
    links: [
      {
        title: "放入素材",
        description: "粘贴文章链接或直接输入文案",
        href: "/workspace",
        icon: FileText,
        color: "mint"
      },
      {
        title: "选择平台",
        description: "为目标渠道匹配合适的表达方式",
        href: "/workspace",
        icon: Workflow,
        color: "blue"
      },
      {
        title: "保存成稿",
        description: "在历史记录中查看和恢复每次生成",
        href: "/workspace",
        icon: FolderOpen,
        color: "rose"
      }
    ]
  },
  {
    label: "资源",
    eyebrow: "RECONTENT / RESOURCES",
    heading: "把每一次创作，都变成下一次的起点。",
    description: "了解 ReContent 的工作方式，快速找到适合你的入口。",
    links: [
      {
        title: "常见问题",
        description: "了解 URL 抓取、生成和保存逻辑",
        href: "#questions",
        icon: Sparkles,
        color: "rose"
      },
      {
        title: "看看创作流程",
        description: "浏览从输入到成稿的完整路径",
        href: "#workflow",
        icon: Workflow,
        color: "blue"
      },
      {
        title: "开始创作",
        description: "打开工作台，生成你的第一份内容",
        href: "/workspace",
        icon: ArrowRight,
        color: "mint"
      }
    ]
  }
];

export default function MegaNav() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const closeTimer = useRef<number | null>(null);

  function cancelClose() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }

  function open(label: string) {
    cancelClose();
    setOpenMenu(label);
  }

  function scheduleClose() {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpenMenu(null), 180);
  }

  useEffect(() => () => cancelClose(), []);

  return (
    <nav className="desktop-nav" aria-label="主导航">
      {menus.map((menu) => {
        const menuId = `mega-menu-${menu.label}`;
        const isOpen = openMenu === menu.label;

        return (
          <div
            className="mega-nav-shell"
            key={menu.label}
            onMouseEnter={() => open(menu.label)}
            onMouseLeave={scheduleClose}
            onFocus={() => open(menu.label)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                scheduleClose();
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                cancelClose();
                setOpenMenu(null);
              }
            }}
          >
            <button
              type="button"
              className="mega-nav-trigger"
              aria-controls={menuId}
              aria-expanded={isOpen}
              onClick={() => isOpen ? setOpenMenu(null) : open(menu.label)}
            >
              {menu.label}
              <ChevronDown size={14} aria-hidden="true" />
            </button>
            {isOpen && (
              <div className="mega-menu" id={menuId}>
                <div className="mega-menu-inner">
                  <div className="mega-menu-intro">
                    <p>{menu.eyebrow}</p>
                    <h2>{menu.heading}</h2>
                    <span>{menu.description}</span>
                  </div>
                  <div className="mega-menu-links">
                    {menu.links.map((link) => {
                      const Icon = link.icon;
                      return (
                        <Link className="mega-menu-link" href={link.href} key={link.title}>
                          <span className={`mega-menu-icon ${link.color}`}>
                            <Icon size={20} aria-hidden="true" />
                          </span>
                          <span className="mega-menu-link-copy">
                            <strong>{link.title}</strong>
                            <small>{link.description}</small>
                          </span>
                          <ArrowRight size={16} aria-hidden="true" />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
