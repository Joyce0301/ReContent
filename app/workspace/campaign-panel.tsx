"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, FolderOpen, Plus, Save, SquarePen } from "lucide-react";
import { CAMPAIGN_LIMITS, type Campaign, type CampaignBrief } from "../lib/campaigns/types";
import type { WorkspaceDraftRecord } from "../lib/drafts/types";

const EMPTY: CampaignBrief = { name: "", goal: "", audience: "", keyMessage: "", cta: "", sourceText: "", sourceUrl: "" };
const FIELDS: { key: keyof CampaignBrief; label: string; required?: boolean }[] = [
  { key: "name", label: "活动名称", required: true },
  { key: "goal", label: "营销目标", required: true },
  { key: "audience", label: "目标受众", required: true },
  { key: "keyMessage", label: "核心信息", required: true },
  { key: "cta", label: "行动号召" },
  { key: "sourceUrl", label: "资料链接" },
  { key: "sourceText", label: "产品资料" }
];

async function getJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败，请重试");
  return data;
}

export function CampaignPanel({ initialId, onCreateContent, onOpenDraft, onDirtyChange }: {
  initialId: string | null;
  onCreateContent: (campaign: Campaign) => void;
  onOpenDraft: (draft: WorkspaceDraftRecord) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [campaignId, setCampaignId] = useState(initialId);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [drafts, setDrafts] = useState<WorkspaceDraftRecord[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [brief, setBrief] = useState<CampaignBrief>(EMPTY);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCampaign(null);
    setCampaigns([]);
    setDrafts([]);
    setNextOffset(null);
    async function load() {
      try {
        if (campaignId) {
          const data = await getJson("/api/campaigns?id=" + campaignId);
          if (cancelled) return;
          setCampaign(data.campaign);
          const history = await getJson("/api/drafts?campaignId=" + campaignId);
          if (cancelled) return;
          setDrafts(history.drafts);
          setNextOffset(history.nextOffset);
        } else {
          const data = await getJson("/api/campaigns");
          if (cancelled) return;
          setCampaigns(data.campaigns);
          setNextOffset(data.nextOffset);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [campaignId, revision]);

  async function loadMore() {
    if (loading || nextOffset === null) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getJson(campaignId ? `/api/drafts?campaignId=${campaignId}&offset=${nextOffset}` : `/api/campaigns?offset=${nextOffset}`);
      if (campaignId) setDrafts(current => [...current, ...data.drafts.filter((item: WorkspaceDraftRecord) => !current.some(old => old.id === item.id))]);
      else setCampaigns(current => [...current, ...data.campaigns.filter((item: Campaign) => !current.some(old => old.id === item.id))]);
      setNextOffset(data.nextOffset);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载失败");
    } finally { setLoading(false); }
  }

  function changeDirty(value: boolean) { setDirty(value); onDirtyChange(value); }
  function cancelEdit() {
    if (saving || (dirty && !window.confirm("活动要求尚未保存，确定放弃修改吗？"))) return;
    changeDirty(false);
    setEditing(false);
    setError(null);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    onDirtyChange(true);
    setError(null);
    try {
      const data = await getJson("/api/campaigns", { method: campaignId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...brief, ...(campaignId ? { id: campaignId } : {}) }) });
      changeDirty(false);
      setEditing(false);
      setCampaignId(data.campaign.id);
      setRevision(value => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败");
      onDirtyChange(dirty);
    } finally { setSaving(false); }
  }

  return <section className="campaign-panel" aria-label="营销活动">
    <header className="campaign-heading">
      {(campaignId || editing) && <button className="chat-icon-button" title="返回" aria-label="返回" disabled={saving || (!editing && loading)} onClick={() => editing ? cancelEdit() : setCampaignId(null)}><ArrowLeft size={20} /></button>}
      <h1>{editing ? (campaignId ? "编辑活动" : "新建活动") : campaignId ? campaign?.name || "活动详情" : "营销活动"}</h1>
      {!editing && !campaignId && <button className="campaign-action" disabled={loading} onClick={() => { setBrief(EMPTY); setEditing(true); setError(null); }}><Plus size={17} />新建活动</button>}
      {!editing && campaign && <button className="chat-icon-button" title="编辑活动要求" aria-label="编辑活动要求" disabled={loading} onClick={() => { setBrief(campaign); setEditing(true); setError(null); }}><SquarePen size={19} /></button>}
    </header>
    {error && <div className="chat-save-error" role="alert"><span>{error}</span>{!editing && <button disabled={loading} onClick={() => setRevision(value => value + 1)}>重试加载</button>}</div>}
    {editing ? <form className="campaign-form" onSubmit={save}>
      <fieldset disabled={saving}>
        {FIELDS.map(({ key, label, required }) => <label key={key}>
          <span>{label}{!required && <small>（选填）</small>}</span>
          {key === "name" || key === "sourceUrl" ? <input type={key === "sourceUrl" ? "url" : "text"} value={brief[key]} required={required} maxLength={CAMPAIGN_LIMITS[key]} onChange={event => { setBrief({ ...brief, [key]: event.target.value }); changeDirty(true); }} /> : <textarea rows={key === "sourceText" ? 6 : 3} value={brief[key]} required={required} maxLength={CAMPAIGN_LIMITS[key]} onChange={event => { setBrief({ ...brief, [key]: event.target.value }); changeDirty(true); }} />}
        </label>)}
      </fieldset>
      <div className="campaign-form-actions"><button type="button" disabled={saving} onClick={cancelEdit}>取消</button><button className="campaign-action" disabled={saving} type="submit"><Save size={17} />{saving ? "正在保存…" : "保存活动"}</button></div>
    </form> : <>
      {campaign && <>
        <dl className="campaign-brief">{FIELDS.filter(field => field.key !== "name" && campaign[field.key]).map(({ key, label }) => <div key={key}><dt>{label}</dt><dd>{campaign[key]}</dd></div>)}</dl>
        <div className="campaign-section-heading"><h2>活动稿件</h2><button className="campaign-action" disabled={loading} onClick={() => onCreateContent(campaign)}><Plus size={17} />创作内容</button></div>
      </>}
      {!campaignId && <div className="campaign-list">{campaigns.map(item => <button className="campaign-row" key={item.id} disabled={loading} onClick={() => setCampaignId(item.id)}><FolderOpen size={20} /><span><strong>{item.name}</strong><small>{item.goal}</small></span><ArrowRight size={18} /></button>)}</div>}
      {campaignId && <div className="campaign-list">{drafts.map(draft => <button className="campaign-row" key={draft.id} onClick={() => onOpenDraft(draft)}><SquarePen size={18} /><span><strong>{draft.name}</strong><small>{new Date(draft.updatedAt).toLocaleDateString("zh-CN")}</small></span><ArrowRight size={18} /></button>)}</div>}
      {loading && <p className="campaign-empty" role="status">正在加载…</p>}
      {!loading && !error && !(campaignId ? drafts : campaigns).length && <p className="campaign-empty">{campaignId ? "还没有活动稿件" : "还没有营销活动"}</p>}
      {nextOffset !== null && <button className="chat-history-more" disabled={loading} onClick={() => void loadMore()}>加载更多</button>}
    </>}
  </section>;
}
