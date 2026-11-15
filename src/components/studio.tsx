"use client";

/* eslint-disable @next/next/no-img-element -- Session frames use browser blob URLs; server image optimization cannot access them. */

import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Check, ChevronRight, Clapperboard, Film, FolderOpen, Grid2X2, Layers, LoaderCircle, Plus, ScanLine, ShieldCheck, Sparkles, Upload, X } from "lucide-react";
import VideoImport from "./video-import";
import { categories, errorMessage, fileSource, formatTime, imageError, validAnalysis, validAnalytics, type Analytics, type Finding, type FrameSource, type Health, type SessionEntry, type Status } from "@/lib/client-analysis";

type View = "projects" | "scenes" | "studio" | "review" | "session";
type Frame = { file: File; source: FrameSource };
function usePreview(file: File | undefined) {
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file); let alive = true;
    // Object URLs are browser resources; create after mount and release on replacement.
    queueMicrotask(() => { if (alive) setPreview(url); });
    return () => { alive = false; URL.revokeObjectURL(url); };
  }, [file]);
  return file ? preview : "";
}
function UploadCard({ kind, frame, preview, disabled, onChange }: { kind: "reference" | "candidate"; frame: Frame | null; preview: string; disabled: boolean; onChange: (file: File | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const title = kind === "reference" ? "Reference" : "Candidate";
  return <section className="upload-card"><header><span className="frame-letter">{kind === "reference" ? "A" : "B"}</span><h3>{title} frame</h3><small>{kind === "reference" ? "SOURCE OF TRUTH" : "FRAME TO CHECK"}</small></header>
    <div className="upload-zone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!disabled && e.dataTransfer.files[0]) onChange(e.dataTransfer.files[0]); }}>
      {preview ? <>{/* Object URLs must bypass the image optimizer. */}{/* Local object URL preview. */}<img src={preview} alt={`${title} frame preview`} onError={() => onChange(null)} /><button className="replace-button" disabled={disabled} onClick={() => input.current?.click()}><Upload size={13} /> Replace</button></> : <button className="upload-trigger" disabled={disabled} onClick={() => input.current?.click()}><Upload size={25} strokeWidth={1} /><strong>Drop your {kind} frame here</strong><span>or browse files</span><small>JPEG, PNG, WebP · up to 8 MiB</small></button>}
      <input ref={input} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label={`Upload ${kind} frame`} disabled={disabled} onChange={e => { onChange(e.target.files?.[0] ?? null); e.target.value = ""; }} />
    </div><footer><span title={frame?.file.name}>{frame?.file.name || "Waiting for frame"}{frame?.source.video && ` · ${formatTime(frame.source.video.timeSeconds)}`}</span>{frame && <button className="icon-button" disabled={disabled} aria-label={`Remove ${kind} frame`} onClick={() => onChange(null)}><X size={13} /></button>}</footer></section>;
}
const nav = [{ id: "projects", label: "Projects", icon: FolderOpen }, { id: "scenes", label: "Scenes", icon: Grid2X2 }, { id: "studio", label: "Studio", icon: ScanLine }, { id: "review", label: "Review", icon: Layers }, { id: "session", label: "Session details", icon: ShieldCheck }] as const;
export default function Studio() {
  const [view, setView] = useState<View>("studio");
  const [projectId, setProjectId] = useState("");
  const [sceneId, setSceneId] = useState("");
  const [context, setContext] = useState("");
  const [reference, setReference] = useState<Frame | null>(null);
  const [candidate, setCandidate] = useState<Frame | null>(null);
  const referencePreview = usePreview(reference?.file);
  const candidatePreview = usePreview(candidate?.file);
  const [compareMode, setCompareMode] = useState<"side" | "overlay">("side");
  const [opacity, setOpacity] = useState(50);
  const [consent, setConsent] = useState(false);
  const [costApproved, setCostApproved] = useState(false);
  const [memoryConsent, setMemoryConsent] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [healthRefresh, setHealthRefresh] = useState(0);
  const [entries, setEntries] = useState<SessionEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const entry = entries.find(e => e.analysis.analysisId === activeId);
  const analysis = entry?.analysis;
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reviewConsent, setReviewConsent] = useState<Record<string, boolean>>({});
  const [reviewMessages, setReviewMessages] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"all" | "open" | "reviewed">("all");
  const [search, setSearch] = useState("");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsBusy, setAnalyticsBusy] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const generation = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const auxiliaryRequest = useRef<AbortController | null>(null);
  const locked = busy || saving || analyticsBusy;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/health", { signal: controller.signal }).then(async r => {
      if (!r.ok) throw new Error(); const h = await r.json();
      if (!h || typeof h.geminiConfigured !== "boolean" || typeof h.model !== "string" || typeof h.databaseConfigured !== "boolean" || typeof h.memoryConfigured !== "boolean" || (h.paidAnalysisEnabled !== undefined && typeof h.paidAnalysisEnabled !== "boolean")) throw new Error();
      setHealth(h); setHealthError(false);
    }).catch(e => { if (e.name !== "AbortError") { setHealth(null); setHealthError(true); } });
    return () => controller.abort();
  }, [healthRefresh]);
  useEffect(() => () => { generation.current++; activeRequest.current?.abort(); auxiliaryRequest.current?.abort(); }, []);
  function invalidate() {
    generation.current++; activeRequest.current?.abort(); activeRequest.current = null;
    setBusy(false); setActiveId(null); setError(""); setNotice(""); setReviewConsent({}); setReviewMessages({}); setAnalytics(null); setAnalyticsError("");
  }
  function upload(kind: "reference" | "candidate", file: File | null, source?: FrameSource) {
    if (lockedRef.current) return;
    invalidate(); const setter = kind === "reference" ? setReference : setCandidate;
    if (file) { const problem = imageError(file); if (problem) { setter(null); setError(problem); return; } }
    setter(file ? { file, source: source || fileSource(file) } : null);
  }
  const canAnalyze = !!(reference && candidate && projectId.trim() && sceneId.trim() && consent && costApproved && health?.geminiConfigured && health.paidAnalysisEnabled !== false && !locked);
  async function analyze() {
    if (!canAnalyze || !reference || !candidate) return;
    const current = ++generation.current;
    const controller = new AbortController(); activeRequest.current = controller;
    setBusy(true); setActiveId(null); setError(""); setNotice(""); setReviewConsent({}); setReviewMessages({});
    const body = new FormData();
    body.set("reference", reference.file); body.set("candidate", candidate.file); body.set("projectId", projectId.trim()); body.set("sceneId", sceneId.trim()); body.set("context", context); body.set("consent", "true"); body.set("costApproved", "true"); body.set("memoryConsent", String(memoryConsent));
    try {
      const response = await fetch("/api/analyze", { method: "POST", body, signal: controller.signal });
      const data: unknown = await response.json().catch(() => { throw new Error("The server returned an unreadable response. Try again."); });
      if (!response.ok) throw new Error(errorMessage(data, "Analysis failed. Check your connection and try again."));
      if (!validAnalysis(data) || data.projectId !== projectId.trim() || data.sceneId !== sceneId.trim()) throw new Error("The analysis response was incomplete. No findings were loaded.");
      if (current !== generation.current) return;
      const next: SessionEntry = { analysis: data, context, reference: reference.file, candidate: candidate.file, sourceFiles: { reference: reference.source, candidate: candidate.source }, savedReviews: {} };
      setEntries(all => [...all.filter(e => e.analysis.analysisId !== data.analysisId), next]); setActiveId(data.analysisId); setFilter("all");
    } catch (e) { if (current === generation.current && !(e instanceof Error && e.name === "AbortError")) setError(e instanceof Error ? e.message : "Analysis failed. Try again."); }
    finally { if (current === generation.current) { setBusy(false); activeRequest.current = null; } }
  }
  function cancel() { generation.current++; activeRequest.current?.abort(); activeRequest.current = null; setBusy(false); setNotice("Analysis cancelled locally. The server may already have processed a billable call; no result was loaded."); }
  function openEntry(next: SessionEntry, target: View = "review") {
    if (locked) return;
    invalidate(); setProjectId(next.analysis.projectId); setSceneId(next.analysis.sceneId); setContext(next.context);
    setReference({ file: next.reference, source: next.sourceFiles.reference }); setCandidate({ file: next.candidate, source: next.sourceFiles.candidate }); setActiveId(next.analysis.analysisId); setView(target); setConsent(false); setCostApproved(false); setMemoryConsent(false); setFilter("all");
  }
  function newComparison() { if (locked) return; invalidate(); setReference(null); setCandidate(null); setConsent(false); setCostApproved(false); setMemoryConsent(false); setView("studio"); }
  function review(id: string, update: Partial<Pick<Finding, "status" | "note">>) {
    if (locked || !activeId) return;
    setReviewMessages(m => { const n = { ...m }; delete n[id]; return n; });
    setEntries(all => all.map(e => e.analysis.analysisId !== activeId ? e : { ...e, savedReviews: { ...e.savedReviews, [id]: "Local changes not saved" }, analysis: { ...e.analysis, findings: e.analysis.findings.map(f => f.id === id ? { ...f, ...update } : f) } }));
  }
  async function saveReview(finding: Finding) {
    if (!analysis || locked || !health?.databaseConfigured || finding.status === "unreviewed" || (health.memoryConfigured && !reviewConsent[finding.id])) return;
    const id = analysis.analysisId; const current = generation.current; const controller = new AbortController(); auxiliaryRequest.current = controller;
    setSaving(true); setReviewMessages(m => ({ ...m, [finding.id]: "Saving decision…" }));
    try {
      const response = await fetch("/api/reviews", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ analysisId: id, findingId: finding.id, projectId: analysis.projectId, sceneId: analysis.sceneId, status: finding.status, note: finding.note ?? "", consent: !!reviewConsent[finding.id] }) });
      const data = await response.json();
      if (!response.ok || data?.persisted !== true || typeof data.memory?.status !== "string" || !data.memory.status) throw new Error(errorMessage(data, "Decision could not be saved. Local review retained."));
      if (current !== generation.current) return;
      const message = `Decision saved. Memory: ${data.memory.status}.${typeof data.memory.warning === "string" ? ` ${data.memory.warning}` : ""}`;
      setReviewMessages(m => ({ ...m, [finding.id]: message }));
      setEntries(all => all.map(e => e.analysis.analysisId === id ? { ...e, savedReviews: { ...e.savedReviews, [finding.id]: message } } : e));
    } catch (e) { if (current === generation.current && !(e instanceof Error && e.name === "AbortError")) setReviewMessages(m => ({ ...m, [finding.id]: e instanceof Error ? e.message : "Save failed. Local review retained." })); }
    finally { if (current === generation.current) { setSaving(false); auxiliaryRequest.current = null; } }
  }
  async function loadAnalytics() {
    if (locked || !projectId.trim()) return;
    const current = generation.current; const controller = new AbortController(); auxiliaryRequest.current = controller;
    setAnalyticsBusy(true); setAnalytics(null); setAnalyticsError("");
    try {
      const response = await fetch(`/api/analytics?projectId=${encodeURIComponent(projectId.trim())}`, { signal: controller.signal });
      const data: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(data, "Analytics unavailable."));
      if (!validAnalytics(data)) throw new Error("Invalid analytics response.");
      if (current === generation.current) setAnalytics(data);
    } catch (e) { if (current === generation.current && !(e instanceof Error && e.name === "AbortError")) setAnalyticsError(e instanceof Error ? e.message : "Analytics unavailable."); }
    finally { if (current === generation.current) { setAnalyticsBusy(false); auxiliaryRequest.current = null; } }
  }
  function exportReport() {
    if (!entry) return;
    const report = { ...entry.analysis, context: entry.context, exportedAt: new Date().toISOString(), reviewScope: "Local edits are session-only unless explicitly saved; savedReviews records successful saves and subsequent local changes.", savedReviews: entry.savedReviews, sourceFiles: entry.sourceFiles };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "continuityghost-report.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const reviewed = analysis?.findings.filter(f => f.status !== "unreviewed").length || 0;
  const visibleFindings = analysis?.findings.filter(f => filter === "all" || (filter === "open" ? f.status === "unreviewed" : f.status !== "unreviewed")) || [];
  const projects = [...new Set(entries.map(e => e.analysis.projectId))];
  const scenes = [...new Set(entries.filter(e => !projectId.trim() || e.analysis.projectId === projectId.trim()).map(e => JSON.stringify([e.analysis.projectId, e.analysis.sceneId])))];
  const filteredEntries = entries.filter(e => (view !== "scenes" || !projectId.trim() || e.analysis.projectId === projectId.trim()) && `${e.analysis.projectId} ${e.analysis.sceneId} ${e.analysis.summary}`.toLowerCase().includes(search.toLowerCase()));
  const connection = healthError ? "Server status unavailable. Retry the connection check in Session details." : !health ? "Checking Gemini connection…" : !health.geminiConfigured ? "Gemini is not configured. Add a server-side API key to enable analysis." : health.paidAnalysisEnabled === false ? "Paid analysis is disabled on this server. Enable ALLOW_PAID_ANALYSIS to analyze." : "Gemini configured · Analysis runs only with both approvals.";
  return <div className="app-shell">
    <aside className="app-nav"><button className="brand-mark" aria-label="ContinuityGhost studio" onClick={() => setView("studio")}>CG<span /></button><nav aria-label="Workspace">{nav.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} aria-current={view === id ? "page" : undefined} onClick={() => setView(id)}><Icon size={19} strokeWidth={1.4} /><span>{label}</span></button>)}</nav><div className="nav-foot"><ShieldCheck size={20} /><span>PRIVATE<br />WORKSPACE</span></div></aside>
    <div className="app-content"><header className="topbar"><div className="crumb">CONTINUITYGHOST <ChevronRight size={12} /><span>{nav.find(n => n.id === view)?.label.toUpperCase()}</span></div><div className="topbar-actions"><span className="fixture"><i />SESSION WORKSPACE</span><span className="online">{health?.databaseConfigured ? "DATABASE CONNECTED" : "LOCAL REVIEWS"}</span></div></header>
    <main>
      <header className="page-heading"><div><p className="eyebrow">THE DETAILS BETWEEN CUTS</p><h1>{view === "studio" ? "Continuity studio" : view === "projects" ? "Your projects" : view === "scenes" ? "Scene library" : view === "review" ? "Continuity review" : "Session details"}</h1><p>{view === "studio" ? "Two moments. One consistent story." : view === "projects" || view === "scenes" ? "Completed comparisons from this browser session. No sample projects or invented metrics." : view === "review" ? "AI suggests. You make the final cut." : "Your connections, permissions, and project analytics."}</p></div><button className="button secondary" disabled={locked} onClick={newComparison}><Plus size={14} />New comparison</button></header>
      <section className="project-bar" aria-label="Session identifiers"><label><FolderOpen size={15} /><span>Project</span><input aria-label="Project" value={projectId} maxLength={120} disabled={locked} placeholder="Enter project name" onChange={e => { invalidate(); setProjectId(e.target.value); }} /></label><label><Clapperboard size={15} /><span>Scene</span><input aria-label="Scene" value={sceneId} maxLength={120} disabled={locked} placeholder="Scene 04 · Kitchen" onChange={e => { invalidate(); setSceneId(e.target.value); }} /></label><span className="session-note">Library is session-only · Export to keep</span></section>
      {(view === "projects" || view === "scenes") && <section className="library"><div className="stats-strip"><div><b>{projects.length}</b><span>SESSION PROJECTS</span></div><div><b>{scenes.length}</b><span>{projectId.trim() ? "SCENES IN PROJECT" : "SESSION SCENES"}</span></div><div><b>{entries.length}</b><span>COMPARISONS</span></div><div><b>{entries.reduce((n, e) => n + e.analysis.findings.length, 0)}</b><span>AI FINDINGS</span></div></div>
        <div className="section-header"><h2>{view === "projects" ? "Projects in this session" : "Scene comparisons"}</h2><input className="search-input" aria-label="Search session comparisons" value={search} placeholder="Search comparisons…" onChange={e => setSearch(e.target.value)} /></div>
        {view === "projects" && projects.length > 0 && <div className="project-cards">{projects.filter(p => p.toLowerCase().includes(search.toLowerCase())).map(p => { const rows = entries.filter(e => e.analysis.projectId === p); return <button key={p} disabled={locked} className="project-card" onClick={() => { invalidate(); setProjectId(p); setSceneId(""); setSearch(""); setView("scenes"); }}><div className="project-art"><Film size={44} strokeWidth={0.8} /></div><small>SESSION PROJECT</small><h3>{p}</h3><p>{new Set(rows.map(e => e.analysis.sceneId)).size} scenes · {rows.length} comparisons</p><span>Open scenes <ChevronRight size={13} /></span></button>; })}</div>}
        {filteredEntries.length ? <div className="scene-table"><div className="scene-table-header"><span>SCENE / PROJECT</span><span>FINDINGS</span><span>REVIEWED</span><span>ACTION</span></div>{filteredEntries.map(e => <div className="scene-row" key={e.analysis.analysisId}><div><strong>{e.analysis.sceneId}</strong><small>{e.analysis.projectId}</small></div><span>{e.analysis.findings.length}</span><span>{e.analysis.findings.filter(f => f.status !== "unreviewed").length} / {e.analysis.findings.length}</span><button disabled={locked} onClick={() => openEntry(e)}>Review <ChevronRight size={13} /></button></div>)}</div> : <div className="empty-state"><FolderOpen size={34} strokeWidth={1} /><h3>{entries.length ? "No matching comparisons" : "No comparisons yet"}</h3><p>Run a real two-frame comparison in Studio to populate this library. Refreshing the page clears the session library.</p><button className="button secondary" onClick={() => setView("studio")}>Open Studio</button></div>}
      </section>}
      <div hidden={view !== "studio"}>
        <div className="editor-layout"><div className="editor-main"><VideoImport active={view === "studio"} disabled={locked} onFrame={(slot, file, source) => upload(slot, file, source)} />
          <section className="comparison"><header className="section-header"><div><small>FRAME COMPARISON</small><h2>Set your frames</h2></div><div className="segmented" aria-label="Comparison mode"><button aria-pressed={compareMode === "side"} onClick={() => setCompareMode("side")}>Side by side</button><button disabled={!reference || !candidate} aria-pressed={compareMode === "overlay"} onClick={() => setCompareMode("overlay")}>Overlay</button></div></header>
            <div className="frame-grid"><UploadCard kind="reference" frame={reference} preview={referencePreview} disabled={locked} onChange={f => upload("reference", f)} /><UploadCard kind="candidate" frame={candidate} preview={candidatePreview} disabled={locked} onChange={f => upload("candidate", f)} /></div>
            {compareMode === "overlay" && referencePreview && candidatePreview && <div className="overlay-panel"><div className="overlay-stage">{/* Local object URL preview. */}<img src={referencePreview} alt="Reference overlay base" />{/* Local object URL preview. */}<img src={candidatePreview} alt="Candidate overlay" style={{ opacity: opacity / 100 }} /></div><label>Candidate opacity <input type="range" min="0" max="100" value={opacity} onChange={e => setOpacity(Number(e.target.value))} />{opacity}%</label><p className="fine-print">Manual overlay only. Frames are fitted without alignment or inferred boxes.</p></div>}
          </section>
        </div><aside className="analysis-controls"><div className="section-header"><div><small>DIRECT THE COMPARISON</small><h2>Analysis setup</h2></div><Sparkles size={17} /></div><label className="context-label" htmlFor="context">Scene context <span>OPTIONAL</span></label><textarea id="context" aria-label="Scene context" maxLength={4000} value={context} disabled={locked} placeholder="Intentional changes, actor positions, details to watch…" onChange={e => { invalidate(); setContext(e.target.value); }} /><p className="char-count">{context.length} / 4,000</p><div className="consents"><label><input type="checkbox" disabled={locked} checked={consent} onChange={e => { invalidate(); setConsent(e.target.checked); }} /><span>I consent to sending both images and context to Google Gemini.</span></label><label><input type="checkbox" disabled={locked} checked={costApproved} onChange={e => { invalidate(); setCostApproved(e.target.checked); }} /><span>I approve a billable Gemini API call.</span></label><label><input type="checkbox" disabled={locked || !health?.memoryConfigured} checked={memoryConsent} onChange={e => { invalidate(); setMemoryConsent(e.target.checked); }} /><span>I consent to retrieving approved project/scene memory from Supermemory for this analysis.</span></label></div><button className="button primary analyze-button" disabled={!canAnalyze} onClick={analyze}>{busy ? <LoaderCircle size={16} className="spin" /> : <ScanLine size={16} />}{busy ? "Comparing frames…" : "Analyze continuity"}</button>{busy && <button className="button secondary" onClick={cancel}>Cancel analysis</button>}<p className="fine-print"><ShieldCheck size={12} />No automatic uploads. Only the two chosen frames are sent, not the video. Analysis may incur a Gemini charge.</p><div className="connection-status" role="status">{connection}</div><div className="setup-categories"><small>LOOKING FOR CHANGES IN</small>{categories.map(c => <span key={c}>{c}</span>)}</div></aside></div>
      </div>
      {(view === "studio" || view === "review") && <section className="results-section" aria-label="Analysis results" aria-busy={busy}>
        <header className="section-header"><div><small>HUMAN JUDGMENT · AI ASSISTED</small><h2>Findings <span className="count">{analysis?.findings.length || 0}</span></h2></div><div className="results-actions">{entries.length > 0 && <select aria-label="Select comparison to review" value={activeId || ""} disabled={locked} onChange={e => { const selected = entries.find(item => item.analysis.analysisId === e.target.value); if (selected) openEntry(selected, view); }}><option value="" disabled>Choose a comparison</option>{entries.map((e, i) => <option key={e.analysis.analysisId} value={e.analysis.analysisId}>{e.analysis.projectId} / {e.analysis.sceneId} · comparison {i + 1}</option>)}</select>}{analysis && <button className="button secondary" onClick={exportReport}><ArrowDownToLine size={14} />Export JSON</button>}</div></header>
        {error && <div role="alert" aria-label="Upload or analysis error" className="error-box">{error}</div>}{notice && <p className="notice" role="status">{notice}</p>}
        <div className="sr-only" aria-live="polite">{busy ? "Analyzing frames with Gemini." : analysis ? `Analysis ready. ${analysis.findings.length} findings to review.` : "No analysis yet."}</div>
        {!analysis ? <div className="empty-state"><ScanLine size={40} strokeWidth={0.8} /><h3>{busy ? "Comparing your chosen frames" : "No analysis yet"}</h3><p>{busy ? "Waiting for Gemini. No findings are displayed until a valid response arrives." : "Upload or capture two frames, enter a project and scene, then approve analysis. No demo findings are shown."}</p>{view === "review" && <button className="button secondary" onClick={() => setView("studio")}>Open Studio</button>}</div> : <>
          {view === "review" && <div className="review-frame-strip">{/* Local object URL preview. */}<img src={referencePreview} alt="Review reference frame" />{/* Local object URL preview. */}<img src={candidatePreview} alt="Review candidate frame" /><div><strong>{analysis.projectId} / {analysis.sceneId}</strong><p>{entry?.sourceFiles.reference.name} → {entry?.sourceFiles.candidate.name}</p><button className="button secondary" onClick={() => setView("studio")}>Inspect in Studio</button></div></div>}
          <div className="analysis-summary"><Sparkles size={18} /><div><h3>Comparison complete</h3><p>{analysis.summary}</p><small>AI suggestions, not verified facts. No inferred certainty, time ranges, or detection boxes. Review edits remain local until explicitly saved.</small>{analysis.persistence && <p>Analysis persistence: {analysis.persistence.status}.{analysis.persistence.warning && ` ${analysis.persistence.warning}`}</p>}{analysis.memory && <div><p>Project/scene memory: {analysis.memory.status}.</p>{analysis.memory.warning && <p>{analysis.memory.warning}</p>}{analysis.memory.facts?.map(fact => <p key={fact.id}>{fact.content}<small>Source: {fact.source}</small></p>)}</div>}</div></div>
          <div className="review-toolbar"><div className="segmented">{([ ["all", `All ${analysis.findings.length}`], ["open", `Open ${analysis.findings.length - reviewed}`], ["reviewed", `Reviewed ${reviewed}`] ] as const).map(([id, label]) => <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div><span>Session review · {reviewed} / {analysis.findings.length} reviewed</span></div>
          {!analysis.findings.length && <p className="empty-findings">No findings returned. This does not guarantee continuity; inspect both frames yourself.</p>}{analysis.findings.length > 0 && !visibleFindings.length && <p className="empty-findings">No findings in this filter.</p>}
          <div className="findings-grid">{visibleFindings.map(f => <article className="finding-card" key={f.id}><header><span className="finding-category">{f.category}</span><span className={`review-status ${f.status}`}>{f.status}</span></header><h3>{f.description}</h3><div className="evidence-grid"><div><small>REFERENCE EVIDENCE</small><p>{f.referenceEvidence}</p></div><div><small>CANDIDATE EVIDENCE</small><p>{f.candidateEvidence}</p></div></div><p className="uncertainty"><strong>Uncertainty:</strong> {f.uncertainty || "Not provided by model."}</p><p><strong>Suggested action:</strong> {f.suggestedAction}</p><div className="review-actions">{([ ["confirmed", "Confirm"], ["dismissed", "Dismiss"], ["intentional", "Intentional"] ] as [Status, string][]).map(([status, label]) => <button key={status} disabled={locked} aria-pressed={f.status === status} onClick={() => review(f.id, { status })}>{f.status === status && <Check size={12} />}{label}</button>)}{f.status !== "unreviewed" && <button disabled={locked} onClick={() => review(f.id, { status: "unreviewed" })}>Reset review</button>}</div><label className="note-label" htmlFor={`note-${f.id}`}>Review note</label><textarea id={`note-${f.id}`} value={f.note || ""} maxLength={4000} disabled={locked} placeholder="Add a production note…" onChange={e => review(f.id, { note: e.target.value })} />{health?.memoryConfigured && <label className="review-memory"><input type="checkbox" disabled={locked} checked={!!reviewConsent[f.id]} onChange={e => setReviewConsent(c => ({ ...c, [f.id]: e.target.checked }))} />I consent to sending this review’s facts and notes to Supermemory.</label>}<p className="fine-print">{!health?.databaseConfigured ? "Local-only review: database is not enabled." : entry?.savedReviews[f.id] || "Local review not yet saved. Save decisions individually."}</p><button className="button secondary" disabled={locked || !health?.databaseConfigured || f.status === "unreviewed" || (!!health.memoryConfigured && !reviewConsent[f.id])} onClick={() => saveReview(f)}>Save decision</button>{reviewMessages[f.id] && <p role="status">{reviewMessages[f.id]}</p>}</article>)}</div>
        </>}
      </section>}
      {view === "session" && <section className="session-content"><div className="session-grid"><article><ShieldCheck size={22} /><h2>{health?.databaseConfigured ? "Durable reviews enabled" : "Ephemeral by design"}</h2><p>Project library, source frames, and unsaved reviews live in this tab only. Export JSON before closing or refreshing. Reports contain source file metadata, not the image bytes.</p><p>{health?.databaseConfigured ? "Database enabled. Successful analysis persistence and review saves are reported individually." : "No database is connected."}</p><p>Supermemory: {health?.memoryConfigured ? "enabled; separate retrieval and review consent required" : "disabled"}.</p></article><article><Sparkles size={22} /><h2>Google Gemini</h2><p>{connection}</p><code>{health?.model || "Model unavailable"}</code><button className="button secondary" disabled={locked} onClick={() => { setHealthError(false); setHealth(null); setHealthRefresh(n => n + 1); }}>Retry connection check</button></article><article><Film size={22} /><h2>Two frames, not a full scan</h2><p>Video playback and frame extraction happen in your browser. Only the two chosen stills and context are sent on approval. Results are possible differences, not verified errors.</p><p>No background scan, fake progress, invented timestamps, or demo metrics.</p></article></div><section className="analytics-panel"><header className="section-header"><div><small>OPTIONAL DATABASE ANALYTICS</small><h2>Project analytics</h2></div><button className="button secondary" disabled={locked || !projectId.trim()} onClick={loadAnalytics}>{analyticsBusy ? "Loading analytics…" : "Load analytics"}</button></header><p>{projectId.trim() || "Set a project to load analytics."}</p><p className="fine-print">Database totals may include earlier sessions. They are separate from the local session library.</p>{analyticsError && <p role="alert" className="error">{analyticsError}</p>}{analytics && <div aria-label="Project analytics"><p>Analyses: {analytics.totals.analyses} · Findings: {analytics.totals.findings} · Reviews: {analytics.totals.reviews}</p><p>Time series: {analytics.timeSeriesMode}</p><div className="analytics-grid">{([ ["Categories", analytics.categories.map(r => [r.category, r.count])], ["Outcomes", analytics.outcomes.map(r => [r.status, r.count])], ["Trends", analytics.trends.map(r => [r.bucket, r.count])] ] as [string, (string | number)[][]][]).map(([title, rows]) => <div key={title}><h3>{title}</h3>{rows.length ? rows.map(([label, count]) => <p key={String(label)}>{label}: {count}</p>) : <p>No recorded data.</p>}</div>)}</div></div>}</section></section>}
      <footer className="page-footer"><span>CONTINUITYGHOST <i /> MADE FOR THE DETAILS BETWEEN CUTS</span><span>AI ASSISTS. YOU DIRECT.</span></footer>
    </main></div>
  </div>;
}
