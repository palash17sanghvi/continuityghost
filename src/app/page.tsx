"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowRight, Check, ChevronRight, Clapperboard, Film, Focus, Info, Layers2, LoaderCircle, ScanLine, ShieldCheck, SlidersHorizontal, Sparkles, Upload, X } from "lucide-react";

const categories = ["wardrobe", "props", "placement", "appearance", "action", "background"] as const;
type Status = "unreviewed" | "confirmed" | "dismissed" | "intentional";
type Finding = { id: string; category: typeof categories[number]; description: string; referenceEvidence: string; candidateEvidence: string; uncertainty: string; suggestedAction: string; status: Status; note?: string };
type Memory = { status: string; facts?: { id: string; content: string; source: string }[]; warning?: string };
type Analytics = { categories: { category: string; count: number }[]; outcomes: { status: string; count: number }[]; trends: { bucket: string; count: number }[]; totals: { analyses: number; findings: number; reviews: number }; timeSeriesMode: "timescale" | "postgres" };
type Analysis = { memory?: Memory; persistence?: { status: "saved" | "disabled" | "failed"; warning?: string }; analysisId: string; projectId: string; sceneId: string; summary: string; findings: Finding[] };
type Health = { geminiConfigured: boolean; model: string; paidAnalysisEnabled?: boolean; memoryConfigured: boolean; databaseConfigured: boolean };
function validAnalysis(value: unknown): value is Analysis {
  if (!value || typeof value !== "object") return false;
  const a = value as Record<string, unknown>;
  if (a.memory !== undefined) {
    if (!a.memory || typeof a.memory !== "object") return false;
    const m = a.memory as Record<string, unknown>;
    if ((typeof m.status !== "string" || !m.status) || (m.warning !== undefined && typeof m.warning !== "string") || (m.facts !== undefined && (!Array.isArray(m.facts) || !m.facts.every(f => f && typeof f === "object" && ["id", "content", "source"].every(k => typeof f[k] === "string"))))) return false;
  }
  if (a.persistence !== undefined) {
    if (!a.persistence || typeof a.persistence !== "object") return false;
    const p = a.persistence as Record<string, unknown>;
    if (!["saved", "disabled", "failed"].includes(String(p.status)) || (p.warning !== undefined && typeof p.warning !== "string")) return false;
  }
  return ["analysisId", "projectId", "sceneId", "summary"].every(k => typeof a[k] === "string") && Array.isArray(a.findings) && a.findings.every(f => f && typeof f === "object" && ["id", "description", "referenceEvidence", "candidateEvidence", "uncertainty", "suggestedAction"].every(k => typeof f[k] === "string") && categories.includes(f.category) && f.status === "unreviewed") && new Set(a.findings.map(f => f.id)).size === a.findings.length;
}

function UploadCard({ kind, file, preview, disabled, onChange }: { kind: "reference" | "candidate"; file: File | null; preview: string; disabled: boolean; onChange: (file: File | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const title = kind === "reference" ? "Reference" : "Candidate";

  return <section className={`upload-card ${file ? "has-image" : ""}`}>
    <div className="card-heading"><span><span className="frame-letter">{kind === "reference" ? "A" : "B"}</span>{title} frame</span><span className="micro">{kind === "reference" ? "THE SOURCE OF TRUTH" : "THE FRAME TO CHECK"}</span></div>
    <div className="upload-zone" onDragOver={e => { e.preventDefault(); }} onDrop={e => { e.preventDefault(); if (!disabled && e.dataTransfer.files[0]) onChange(e.dataTransfer.files[0]); }}>
      {preview ? <>
        {/* Blob URLs are local previews, not Next.js optimizer sources. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview} alt={`${title} frame preview`} onError={() => onChange(null)} /><button className="replace-button" type="button" disabled={disabled} onClick={() => input.current?.click()}><Upload size={14} /> Replace frame</button></> : <button className="upload-trigger" type="button" disabled={disabled} onClick={() => input.current?.click()}><span className="upload-icon"><Upload size={23} strokeWidth={1.4} /></span><strong>Drop your {kind} frame here</strong><span>or <span className="amber">browse files</span></span><small>JPEG, PNG, WebP · up to 8 MiB</small></button>}
      <input ref={input} className="sr-only" aria-label={`Upload ${kind} frame`} type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={e => { onChange(e.target.files?.[0] ?? null); e.target.value = ""; }} />
      <span className="corner corner-tl" /><span className="corner corner-br" />
    </div>
    <div className="frame-footer"><span><span className={`tiny-dot ${file ? "ready" : ""}`} />{file ? file.name : "Waiting for frame"}</span>{file && <button type="button" className="icon-button" disabled={disabled} onClick={() => onChange(null)} aria-label={`Remove ${kind} frame`}><X size={14} /></button>}<span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MiB` : "LOCAL PREVIEW"}</span></div>
  </section>;
}

export default function Home() {
  const [tab, setTab] = useState<"studio" | "session">("studio");
  const [projectId, setProjectId] = useState("");
  const [sceneId, setSceneId] = useState("");
  const [context, setContext] = useState("");
  const [reference, setReference] = useState<File | null>(null);
  const [candidate, setCandidate] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState("");
  const [candidatePreview, setCandidatePreview] = useState("");
  useEffect(() => () => { if (referencePreview) URL.revokeObjectURL(referencePreview); }, [referencePreview]);
  useEffect(() => () => { if (candidatePreview) URL.revokeObjectURL(candidatePreview); }, [candidatePreview]);
  const [consent, setConsent] = useState(false);
  const [memoryConsent, setMemoryConsent] = useState(false);
  const [reviewConsent, setReviewConsent] = useState<Record<string, boolean>>({});
  const [reviewMessages, setReviewMessages] = useState<Record<string, { text: string; warning?: string }>>({});
  const [saving, setSaving] = useState(false);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsError, setAnalyticsError] = useState("");
  const [analyticsBusy, setAnalyticsBusy] = useState(false);
  const [costApproved, setCostApproved] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/health", { signal: controller.signal }).then(async r => { if (!r.ok) throw new Error(); const h = await r.json(); if (typeof h.geminiConfigured !== "boolean" || typeof h.model !== "string") throw new Error(); setHealth(h); }).catch(e => { if (e.name !== "AbortError") setHealthError(true); });
    return () => { controller.abort(); activeRequest.current?.abort(); };
  }, []);
  function invalidate() { generation.current++; activeRequest.current?.abort(); setBusy(false); setAnalysis(null); setError(""); setReviewConsent({}); setReviewMessages({}); setAnalytics(null); setAnalyticsError(""); }
  function upload(kind: "reference" | "candidate", file: File | null) {
    invalidate();
    const setPreview = kind === "reference" ? setReferencePreview : setCandidatePreview;
    setPreview("");
    if (file && (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size || file.size > 8 * 1024 * 1024)) {
      (kind === "reference" ? setReference : setCandidate)(null);
      setError("Choose a JPEG, PNG, or WebP image, no larger than 8 MiB and not empty."); return;
    }
    if (file) setPreview(URL.createObjectURL(file));
    (kind === "reference" ? setReference : setCandidate)(file);
  }
  const canAnalyze = !!(reference && candidate && projectId.trim() && sceneId.trim() && consent && costApproved && health?.geminiConfigured && health.paidAnalysisEnabled !== false && !busy && !saving && !analyticsBusy);
  async function analyze() {
    if (!canAnalyze || !reference || !candidate) return;
    const current = ++generation.current;
    const controller = new AbortController(); activeRequest.current = controller;
    setBusy(true); setError(""); setAnalysis(null);
    const body = new FormData();
    body.set("reference", reference); body.set("candidate", candidate); body.set("projectId", projectId.trim()); body.set("sceneId", sceneId.trim()); body.set("context", context); body.set("consent", "true"); body.set("costApproved", "true"); body.set("memoryConsent", String(memoryConsent));
    try {
      const response = await fetch("/api/analyze", { method: "POST", body, signal: controller.signal });
      const data = await response.json().catch(() => { throw new Error("The server returned an unreadable response. Try again."); });
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : data.error?.message || "Analysis failed. Check your connection and try again.");
      if (!validAnalysis(data)) throw new Error("The analysis response was incomplete. No findings were loaded.");
      if (current === generation.current) setAnalysis(data);
    } catch (e) { if (current === generation.current && !(e instanceof Error && e.name === "AbortError")) setError(e instanceof Error ? e.message : "Analysis failed. Try again."); }
    finally { if (current === generation.current) { setBusy(false); activeRequest.current = null; } }
  }
  const locked = busy || saving || analyticsBusy;
  async function saveReview(finding: Finding) {
    if (!analysis || locked || !health?.databaseConfigured || (health.memoryConfigured && !reviewConsent[finding.id])) return;
    setSaving(true); setReviewMessages(m => ({ ...m, [finding.id]: { text: "Saving decision…" } }));
    try {
      const res = await fetch("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ analysisId: analysis.analysisId, findingId: finding.id, projectId: analysis.projectId, sceneId: analysis.sceneId, status: finding.status, note: finding.note ?? "", consent: !!reviewConsent[finding.id] }) });
      const data = await res.json();
      if (!res.ok || data.persisted !== true || (typeof data.memory?.status !== "string" || !data.memory.status)) throw new Error(data.error || "Decision could not be saved. Local review retained.");
      setReviewMessages(m => ({ ...m, [finding.id]: { text: `Decision saved. Memory: ${data.memory.status}.`, warning: typeof data.memory.warning === "string" ? data.memory.warning : undefined } }));
    } catch (e) { setReviewMessages(m => ({ ...m, [finding.id]: { text: e instanceof Error ? e.message : "Save failed. Local review retained." } })); }
    finally { setSaving(false); }
  }
  async function loadAnalytics() {
    if (locked || !projectId.trim()) return;
    setAnalyticsBusy(true); setAnalytics(null); setAnalyticsError("");
    try {
      const res = await fetch(`/api/analytics?projectId=${encodeURIComponent(projectId.trim())}`);
      const data = await res.json();
      const count = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0;
      if (!res.ok) throw new Error(data.error || "Analytics unavailable.");
      if (!["timescale", "postgres"].includes(data.timeSeriesMode) || !data.totals || ![data.totals.analyses, data.totals.findings, data.totals.reviews].every(count) || ![["categories", "category"], ["outcomes", "status"], ["trends", "bucket"]].every(([key, label]) => Array.isArray(data[key]) && data[key].every((row: Record<string, unknown>) => row && typeof row[label] === "string" && count(row.count)))) throw new Error("Invalid analytics response.");
      setAnalytics(data);
    } catch (e) { setAnalyticsError(e instanceof Error ? e.message : "Analytics unavailable."); }
    finally { setAnalyticsBusy(false); }
  }
  function review(id: string, update: Partial<Pick<Finding, "status" | "note">>) { setReviewMessages(m => { const next = { ...m }; delete next[id]; return next; }); setAnalysis(a => a ? { ...a, findings: a.findings.map(f => f.id === id ? { ...f, ...update } : f) } : null); }
  function exportReport() {
    if (!analysis) return;
    const blob = new Blob([JSON.stringify({ ...analysis, context, exportedAt: new Date().toISOString(), reviewScope: "session-only", sourceFiles: { reference: reference?.name, candidate: candidate?.name } }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "continuityghost-report.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="app-shell">
    <aside className="sidebar"><Link href="/" className="brand" aria-label="ContinuityGhost home"><span className="brand-mark">CG<span /></span><span>continuity<span className="muted">ghost</span><small>THE CONTINUITY WORKSPACE</small></span></Link><div className="workspace-label">WORKSPACE</div><nav role="tablist" aria-label="Workspace"><button id="studio-tab" type="button" role="tab" aria-selected={tab === "studio"} aria-controls="studio-panel" onClick={() => setTab("studio")} className={tab === "studio" ? "nav-item selected" : "nav-item"}><ScanLine size={18} />Studio<span className="nav-indicator" /></button><button id="session-tab" type="button" role="tab" aria-selected={tab === "session"} aria-controls="session-panel" onClick={() => setTab("session")} className={tab === "session" ? "nav-item selected" : "nav-item"}><Layers2 size={18} />Session details</button></nav><div className="sidebar-bottom"><div className="privacy-icon"><ShieldCheck size={19} /></div><strong>Your frames. Your call.</strong><p>Images stay local until you approve an analysis.</p><div className="sidebar-version"><span className="tiny-dot ready" />PRIVATE WORKSPACE<span>v0.1</span></div></div></aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb">Workspace<ChevronRight size={13} /><span>{tab === "studio" ? "Comparison studio" : "Session details"}</span></div><div className="session-badge"><span className="tiny-dot ready" />{health?.databaseConfigured ? "REVIEW STORAGE ENABLED" : "SESSION ONLY"}</div></header>
    <main>
      <section className="page-heading"><div><div className="eyebrow"><span />CONTINUITY, WITHOUT THE GUESSWORK</div><h1>{tab === "studio" ? <>Every detail. <span>Every take.</span></> : "Session details"}</h1><p>{tab === "studio" ? "Compare two frames. Catch what changed. Keep the story consistent." : "A transparent view of this workspace and its connections."}</p></div><div className="heading-icon"><Focus size={32} strokeWidth={1} /></div></section>
      <section className="project-bar" aria-label="Session identifiers"><div><Film size={17} /><label htmlFor="project">Project</label><input disabled={locked} id="project" value={projectId} maxLength={120} placeholder="Enter project name" onChange={e => { invalidate(); setProjectId(e.target.value); }} /></div><span className="project-divider" /><div><Clapperboard size={17} /><label htmlFor="scene">Scene</label><input disabled={locked} id="scene" value={sceneId} maxLength={120} placeholder="e.g. Scene 04 · Kitchen" onChange={e => { invalidate(); setSceneId(e.target.value); }} /></div><span className="unsaved"><span className="tiny-dot" />Not saved to a database</span></section>
      <div id="session-panel" role="tabpanel" aria-labelledby="session-tab" hidden={tab !== "session"}><section className="session-content"><div className="section-label"><span className="step">01</span><h2>Workspace connections</h2></div><div className="session-grid"><article><ShieldCheck size={22} /><h3>{health?.databaseConfigured ? "Durable reviews enabled" : "Ephemeral by design"}</h3><p>Edits stay local until saved. Export JSON to keep unsaved notes before closing this tab.</p><p>{health?.databaseConfigured ? "Database enabled." : "No database or cross-session memory is connected."}</p><p>Supermemory: {health?.memoryConfigured ? "enabled; separate retrieval and review consent required" : "disabled"}.</p></article><article><Sparkles size={22} /><h3>Google Gemini</h3><p>{health ? health.geminiConfigured ? "API key configured. Analysis requires your explicit approval." : "API key not configured. Add the server-side Gemini API key before analyzing." : healthError ? "Connection status unavailable. Reload to check again." : "Checking server configuration…"}</p><code>{health?.model || "Model unavailable"}</code></article><article><Info size={22} /><h3>You stay in the loop</h3><p>AI findings may be incomplete or incorrect. Confirm, dismiss, or mark intentional after checking the frames yourself. Save decisions explicitly. Supermemory sharing needs separate review consent when enabled.</p></article></div><div className="analysis-summary"><div><h3>Project analytics</h3><p>{projectId.trim() || "Set a project to load analytics."}</p><button type="button" className="export-button" disabled={locked || !projectId.trim()} onClick={loadAnalytics}>{analyticsBusy ? "Loading analytics…" : "Load analytics"}</button>{analyticsError && <p role="alert">{analyticsError}</p>}{analytics && <div aria-label="Project analytics"><p>Analyses: {analytics.totals.analyses} · Findings: {analytics.totals.findings} · Reviews: {analytics.totals.reviews}</p><p>Time series: {analytics.timeSeriesMode}</p><h4>Categories</h4>{analytics.categories.map(row => <p key={row.category}>{row.category}: {row.count}</p>)}<h4>Outcomes</h4>{analytics.outcomes.map(row => <p key={row.status}>{row.status}: {row.count}</p>)}<h4>Trends</h4>{analytics.trends.map(row => <p key={row.bucket}>{row.bucket}: {row.count}</p>)}</div>}</div></div></section></div>
      <div id="studio-panel" role="tabpanel" aria-labelledby="studio-tab" hidden={tab !== "studio"}>
      <section className="frames-section"><div className="section-heading"><div className="section-label"><span className="step">01</span><h2>Set your frames</h2></div><span className="section-helper">Same scene. Two moments.</span></div><div className="frame-grid"><UploadCard kind="reference" file={reference} preview={referencePreview} disabled={locked} onChange={f => upload("reference", f)} /><span className="compare-link" aria-hidden="true"><ArrowRight size={17} /></span><UploadCard kind="candidate" file={candidate} preview={candidatePreview} disabled={locked} onChange={f => upload("candidate", f)} /></div></section>
      <section className="context-section"><div className="section-heading"><div className="section-label"><span className="step">02</span><h2>Add the director’s notes</h2><span className="optional">OPTIONAL</span></div><SlidersHorizontal size={15} /></div><label className="sr-only" htmlFor="context">Scene context</label><textarea disabled={locked} id="context" maxLength={4000} value={context} onChange={e => { invalidate(); setContext(e.target.value); }} placeholder="What should we know? Describe the scene, intentional changes, or details to watch for…" /><div className="context-footer"><span><Info size={12} />A little context helps distinguish a continuity slip from a creative choice.</span><span>{context.length} / 4,000</span></div></section>
      <section className="analyze-section"><div className="consents"><label><input disabled={locked} type="checkbox" checked={consent} onChange={e => { invalidate(); setConsent(e.target.checked); }} /><span>I consent to sending both images and context to Google Gemini.</span></label><label><input type="checkbox" disabled={locked || !health?.memoryConfigured} checked={memoryConsent} onChange={e => { invalidate(); setMemoryConsent(e.target.checked); }} /><span>I consent to retrieving approved project/scene memory from Supermemory for this analysis.</span></label><label><input disabled={locked} type="checkbox" checked={costApproved} onChange={e => { invalidate(); setCostApproved(e.target.checked); }} /><span>I approve a billable Gemini API call.</span></label><p><ShieldCheck size={12} />No automatic uploads. No background analysis. Save reviews explicitly.</p></div><button className="analyze-button" type="button" disabled={!canAnalyze} onClick={analyze}>{busy ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}{busy ? "Comparing frames…" : "Analyze continuity"}<ArrowRight size={16} /></button></section>
      <div className="connection-status" role="status">{healthError ? "Server status unavailable. Reload the page to reconnect." : !health ? "Checking Gemini connection…" : !health.geminiConfigured ? "Gemini is not configured. Add a server-side API key to enable analysis." : health.paidAnalysisEnabled === false ? "Paid analysis is disabled on this server. Enable ALLOW_PAID_ANALYSIS to analyze." : !reference || !candidate ? "Add two frames and session identifiers, then approve analysis to begin." : !projectId.trim() || !sceneId.trim() ? "Enter a project and scene before analysis." : "Gemini configured · Analysis runs only with both approvals."}</div>
      {error && <div role="alert" aria-label="Upload or analysis error" className="error-box"><Info size={17} /><span>{error}</span></div>}
      <section className="results-section" aria-label="Analysis results" aria-busy={busy}><div className="section-heading"><div className="section-label"><span className="step">03</span><h2>Continuity review</h2>{analysis && <span className="count">{analysis.findings.length}</span>}</div>{analysis ? <button type="button" className="export-button" onClick={exportReport}><ArrowDownToLine size={14} />Export JSON</button> : <span className="section-helper">Human judgment. AI-assisted.</span>}</div>
      <div aria-live="polite" className="sr-only">{busy ? "Analyzing frames with Gemini." : analysis ? `Analysis ready. ${analysis.findings.length} findings to review.` : "No analysis yet."}</div>
      {!analysis ? <div className="empty-state"><div className="film-diagram" aria-hidden="true"><div className="mini-frame frame-back"><span /><span /><span /></div><div className="diagram-connector" /><div className="mini-frame frame-front"><Focus size={30} strokeWidth={1} /></div><span className="diagram-spark"><Sparkles size={15} /></span></div><h3>{busy ? "Looking between the frames" : "No analysis yet"}</h3><p>{busy ? "Gemini is comparing your frames. Findings will appear here for your review." : "The smallest details tell the biggest stories. Add your frames to see what changed."}</p><div className="category-list">{categories.map(c => <span key={c}>{c}</span>)}</div></div> : <div className="findings"><div className="analysis-summary"><Sparkles size={18} /><div><h3>Comparison complete</h3><p>{analysis.summary}</p><small>AI suggestions, not verified facts. Review edits stay local until you save each decision.</small></div></div>{analysis.persistence && <div className="analysis-summary"><div><p>Analysis persistence: {analysis.persistence.status}.</p>{analysis.persistence.warning && <p>{analysis.persistence.warning}</p>}</div></div>}{analysis.memory && <div className="analysis-summary"><div><p>Project/scene memory: {analysis.memory.status}.</p>{analysis.memory.warning && <p>{analysis.memory.warning}</p>}{analysis.memory.facts?.map(fact => <div key={fact.id}><p>{fact.content}</p><small>{fact.source}</small></div>)}</div></div>}{analysis.findings.length === 0 && <div className="empty-findings">No findings returned. This does not guarantee continuity; inspect both frames yourself.</div>}{analysis.findings.map((f, i) => <article className="finding-card" key={f.id}><div className="finding-heading"><span className="finding-number">{String(i + 1).padStart(2, "0")}</span><span className="finding-category">{f.category}</span><span className={`review-status ${f.status}`}>{f.status}</span></div><h3>{f.description}</h3><div className="evidence-grid"><div><span>REFERENCE EVIDENCE</span><p>{f.referenceEvidence}</p></div><div><span>CANDIDATE EVIDENCE</span><p>{f.candidateEvidence}</p></div></div><p className="uncertainty"><Info size={14} /><span><strong>Uncertainty:</strong> {f.uncertainty || "Not provided by model."}</span></p><p className="suggestion"><strong>Suggested action</strong> {f.suggestedAction}</p><div className="review-actions">{([ ["confirmed", "Confirm"], ["dismissed", "Dismiss"], ["intentional", "Intentional"] ] as const).map(([status, label]) => <button key={status} type="button" disabled={locked} aria-pressed={f.status === status} onClick={() => review(f.id, { status })}>{f.status === status && <Check size={13} />}{label}</button>)}{f.status !== "unreviewed" && <button type="button" disabled={locked} onClick={() => review(f.id, { status: "unreviewed" })}>Reset review</button>}</div><label className="note-label" htmlFor={`note-${i}`}>Review note</label><textarea disabled={locked} id={`note-${i}`} value={f.note || ""} maxLength={4000} placeholder="Add your decision or production note…" onChange={e => review(f.id, { note: e.target.value })} />
{health?.memoryConfigured && <label className="note-label"><input type="checkbox" checked={!!reviewConsent[f.id]} disabled={locked} onChange={e => setReviewConsent(c => ({ ...c, [f.id]: e.target.checked }))} />I consent to sending this review’s facts and notes to Supermemory.</label>}
{!health?.databaseConfigured && <p>Local-only review: database is not enabled.</p>}
<button type="button" className="export-button" disabled={locked || !health?.databaseConfigured || f.status === "unreviewed" || (!!health?.memoryConfigured && !reviewConsent[f.id])} onClick={() => saveReview(f)}>Save decision</button>
{reviewMessages[f.id] && <div role="status"><p>{reviewMessages[f.id].text}</p>{reviewMessages[f.id].warning && <p>{reviewMessages[f.id].warning}</p>}</div>}</article>)}</div>}
      </section></div>
      <footer className="page-footer"><span><span className="footer-monogram">CG</span>Made for the details between cuts.</span><span>AI assists. You direct.</span></footer>
    </main></div>
  </div>;
}
