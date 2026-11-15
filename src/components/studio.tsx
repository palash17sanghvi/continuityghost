"use client";
/* eslint-disable @next/next/no-img-element -- Stored extracted frames are same-origin API media, not public assets. */
import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Clapperboard, Film, FolderOpen, Layers, LoaderCircle, ScanLine, ShieldCheck, Sparkles, X } from "lucide-react";
import VideoImport from "./video-import";
import { errorMessage, formatTime, mediaUrl, parseVideoAnalysis, responseJson, type Health, type Status } from "@/lib/client-analysis";
import type { VideoAnalysis } from "@/lib/video-contract";

type Scope = { projectId: string; sceneId: string };
const storageKey = "continuityghost.video.selection";
function remember(scope: Scope, analysisId?: string) {
 try { localStorage.setItem(storageKey, JSON.stringify({ ...scope, ...(analysisId ? { analysisId } : {}) })); } catch { /* API persistence does not depend on browser storage. */ }
}
export default function Studio() {
 const [view, setView] = useState<"studio" | "history">("studio");
 const [scope, setScope] = useState<Scope>({ projectId: "my-film", sceneId: "scene-01" });
 const [clip, setClip] = useState<File | null>(null);
 const [ready, setReady] = useState(false);
 const [context, setContext] = useState("");
 const [consent, setConsent] = useState(false);
 const [costApproved, setCostApproved] = useState(false);
 const [memoryConsent, setMemoryConsent] = useState(false);
 const [health, setHealth] = useState<Health | null>(null);
 const [healthError, setHealthError] = useState(false);
 const [healthRefresh, setHealthRefresh] = useState(0);
 const [analysis, setAnalysis] = useState<VideoAnalysis | null>(null);
 const [history, setHistory] = useState<VideoAnalysis[]>([]);
 const [historyStatus, setHistoryStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
 const [activeId, setActiveId] = useState<string | null>(null);
 const [review, setReview] = useState<{ status: Status; note: string }>({ status: "unreviewed", note: "" });
 const [reviewConsent, setReviewConsent] = useState(false);
 const [busy, setBusy] = useState<"analyze" | "load" | "review" | null>(null);
 const [error, setError] = useState("");
 const [notice, setNotice] = useState("");
 const request = useRef<AbortController | null>(null);
 const [seek, setSeek] = useState<{ time: number; nonce: number } | null>(null);
 const finding = analysis?.findings.find(f => f.id === activeId);
 const dirty = !!finding && (review.status !== finding.status || review.note !== (finding.note || ""));
 const scopeValid = !!scope.projectId.trim() && !!scope.sceneId.trim() && scope.projectId.length <= 120 && scope.sceneId.length <= 120;
 useEffect(() => {
  const controller = new AbortController();
  fetch("/api/health", { signal: controller.signal }).then(responseJson).then(value => {
   const h = value as Health;
   if (!h || typeof h.geminiConfigured !== "boolean" || typeof h.model !== "string" || typeof h.paidAnalysisEnabled !== "boolean" || typeof h.memoryConfigured !== "boolean" || typeof h.databaseConfigured !== "boolean") throw new Error("Invalid health response.");
   setHealth(h); setHealthError(false);
  }).catch(() => { if (!controller.signal.aborted) { setHealth(null); setHealthError(true); } });
  return () => controller.abort();
 }, [healthRefresh]);
 useEffect(() => {
  const controller = new AbortController(); request.current = controller;
  async function reopen() {
   try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (!value || typeof value !== "object" || !("projectId" in value) || !("sceneId" in value) || typeof value.projectId !== "string" || typeof value.sceneId !== "string" || !value.projectId.trim() || !value.sceneId.trim() || value.projectId.length > 120 || value.sceneId.length > 120) return;
    const saved = { projectId: value.projectId, sceneId: value.sceneId }; setScope(saved);
    if (!("analysisId" in value) || typeof value.analysisId !== "string" || !/^[0-9a-f-]{36}$/i.test(value.analysisId)) return;
    setBusy("load");
    const result = parseVideoAnalysis(await responseJson(await fetch(`/api/video/${encodeURIComponent(value.analysisId)}?${new URLSearchParams(saved)}`, { signal: controller.signal, cache: "no-store" })), saved, value.analysisId);
    if (!controller.signal.aborted) {
     setAnalysis(result);
     const first = result.findings[0];
     if (first) { setActiveId(first.id); setReview({ status: first.status, note: first.note || "" }); }
     setNotice("Reopened stored analysis and reviews.");
    }
   } catch (e) { if (!controller.signal.aborted) setError(`Could not reopen analysis: ${errorMessage(e)}`); }
   finally { if (!controller.signal.aborted) { setBusy(null); request.current = null; } }
  }
  void reopen();
  return () => controller.abort();
 }, []);
 useEffect(() => {
  if (!dirty) return;
  const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
  window.addEventListener("beforeunload", warn);
  return () => window.removeEventListener("beforeunload", warn);
 }, [dirty]);
 useEffect(() => () => request.current?.abort(), []);
 function canLeave() { return !dirty || window.confirm("Discard unsaved review changes?"); }
 function resetResult() { setAnalysis(null); setActiveId(null); setError(""); setNotice(""); setReviewConsent(false); }
 function changeScope(field: keyof Scope, value: string) {
  if (busy || !canLeave()) return;
  const next = { ...scope, [field]: value }; setScope(next); resetResult(); setHistory([]); setHistoryStatus("idle"); remember(next);
 }
 function chooseFile(file: File | null) {
  if (busy || !canLeave()) return false;
  setClip(file); setReady(false); resetResult(); setCostApproved(false); remember(scope); return true;
 }
 async function analyze() {
  if (busy || !clip || !ready || !scopeValid || !consent || !costApproved || !health?.geminiConfigured || !health.paidAnalysisEnabled || !canLeave()) return;
  const controller = new AbortController(); request.current = controller;
  setBusy("analyze"); resetResult(); setCostApproved(false);
  const selected = { projectId: scope.projectId.trim(), sceneId: scope.sceneId.trim() };
  const form = new FormData(); form.set("video", clip); form.set("projectId", selected.projectId); form.set("sceneId", selected.sceneId); form.set("context", context); form.set("consent", "true"); form.set("costApproved", "true"); form.set("memoryConsent", String(memoryConsent));
  try {
   const result = parseVideoAnalysis(await responseJson(await fetch("/api/video/analyze", { method: "POST", body: form, signal: controller.signal })), selected);
   if (controller.signal.aborted) return;
   setScope(selected); setAnalysis(result); setClip(null); remember(selected, result.analysisId); setNotice("Analysis stored. Select a timestamped issue to inspect evidence.");
  } catch (e) { if (!controller.signal.aborted) setError(errorMessage(e)); }
  finally { if (!controller.signal.aborted) { setBusy(null); request.current = null; } }
 }
 function cancel() { request.current?.abort(); request.current = null; if (historyStatus === "loading") setHistoryStatus("idle"); setBusy(null); setNotice("Request cancelled. Server work may already have started; cancellation does not guarantee a cost refund. Check saved analyses before retrying."); }
 async function loadHistory() {
  if (busy || !scopeValid || !canLeave()) return;
  const controller = new AbortController(); request.current = controller;
  setView("history"); setBusy("load"); setHistoryStatus("loading"); setError(""); setHistory([]);
  try {
   const selected = { projectId: scope.projectId.trim(), sceneId: scope.sceneId.trim() };
   const body = await responseJson(await fetch(`/api/video/history?${new URLSearchParams(selected)}`, { signal: controller.signal, cache: "no-store" }));
   if (!body || typeof body !== "object" || !("analyses" in body) || !Array.isArray(body.analyses)) throw new Error("Invalid history response.");
   const entries = body.analyses.map(value => parseVideoAnalysis(value, selected));
   if (!controller.signal.aborted) { setHistory(entries); setHistoryStatus("ready"); }
  } catch (e) { if (!controller.signal.aborted) { setHistoryStatus("error"); setError(errorMessage(e)); } }
  finally { if (!controller.signal.aborted) { setBusy(null); request.current = null; } }
 }
 async function openAnalysis(id: string) {
  if (busy || !canLeave()) return;
  const controller = new AbortController(); request.current = controller; setBusy("load"); setError("");
  try {
   const selected = { projectId: scope.projectId.trim(), sceneId: scope.sceneId.trim() };
   const result = parseVideoAnalysis(await responseJson(await fetch(`/api/video/${encodeURIComponent(id)}?${new URLSearchParams(selected)}`, { signal: controller.signal, cache: "no-store" })), selected, id);
   if (!controller.signal.aborted) { setAnalysis(result); setClip(null); setActiveId(null); setView("studio"); remember(selected, id); }
  } catch (e) { if (!controller.signal.aborted) setError(errorMessage(e)); }
  finally { if (!controller.signal.aborted) { setBusy(null); request.current = null; } }
 }
 function selectFinding(id: string) {
  if (busy || !analysis || (id !== activeId && !canLeave())) return;
  const next = analysis.findings.find(f => f.id === id)!;
  const pair = analysis.pairs.find(p => p.id === next.pairId)!;
  const candidate = analysis.frames.find(f => f.id === pair.candidateFrameId)!;
  setSeek(previous => ({ time: candidate.timeSeconds, nonce: (previous?.nonce || 0) + 1 }));
  if (id === activeId) return;
  setActiveId(id); setReview({ status: next.status, note: next.note || "" }); setReviewConsent(false); setNotice("");
 }
 async function saveReview() {
  if (busy || !analysis || !finding || review.status === "unreviewed") return;
  const controller = new AbortController(); request.current = controller; setBusy("review"); setError(""); setNotice("");
  try {
   const body = await responseJson(await fetch("/api/video/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ analysisId: analysis.analysisId, findingId: finding.id, projectId: analysis.projectId, sceneId: analysis.sceneId, status: review.status, note: review.note, consent: reviewConsent }) }));
   if (!body || typeof body !== "object" || !("persisted" in body) || body.persisted !== true || !("analysis" in body)) throw new Error("Review was not persisted. Your edits are still here.");
   const result = parseVideoAnalysis(body.analysis, analysis, analysis.analysisId);
   const saved = result.findings.find(f => f.id === finding.id);
   if (!saved || saved.status !== review.status || (saved.note || "") !== review.note.trim()) throw new Error("Saved review did not match your edits. Please retry.");
   if (!controller.signal.aborted) { setAnalysis(result); setReview({ status: saved.status, note: saved.note || "" }); setReviewConsent(false); setNotice("Review saved to server. It survives reload."); }
  } catch (e) { if (!controller.signal.aborted) setError(errorMessage(e)); }
  finally { if (!controller.signal.aborted) { setBusy(null); request.current = null; } }
 }
 function exportJson() {
  if (!analysis) return;
  const payload = { analysis, ...(dirty && finding ? { unsavedDraft: { findingId: finding.id, ...review } } : {}) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = `continuity-${analysis.analysisId}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
 }
 const pair = finding && analysis?.pairs.find(p => p.id === finding.pairId);
 const reference = pair && analysis?.frames.find(f => f.id === pair.referenceFrameId);
 const candidate = pair && analysis?.frames.find(f => f.id === pair.candidateFrameId);
 return <div className="app-shell">
  <nav className="app-nav" aria-label="Main navigation"><div className="brand-mark">CG<span>·</span></div><button className="nav-item" aria-label="Projects and scenes" disabled={!!busy} onClick={() => { setView("studio"); document.getElementById("project-id")?.focus(); }}><FolderOpen size={21} /><span>Projects</span></button><button className={`nav-item ${view === "studio" ? "active" : ""}`} aria-label="Analysis studio" onClick={() => setView("studio")}><ScanLine size={22} /><span>Analyze</span></button><button className={`nav-item ${view === "history" ? "active" : ""}`} aria-label="Saved analyses" disabled={!!busy || !scopeValid} onClick={loadHistory}><Layers size={21} /><span>Saved</span></button><div className="nav-footer"><Clapperboard size={20} /><span>CG / V.01</span></div></nav>
  <div className="app-content"><header className="topbar"><div className="breadcrumb"><span>WORKSPACE</span><ChevronRight size={13} /><b>ContinuityGhost</b><ChevronRight size={13} /><span>{view === "studio" ? "Analysis studio" : "Saved analyses"}</span></div><span className="connection"><i className={health?.geminiConfigured && health.paidAnalysisEnabled ? "on" : ""} />{health?.geminiConfigured ? `Gemini configured · ${health.model}` : "Gemini unavailable"}</span></header>
  <main className="workspace"><div className="page-heading"><div><p className="eyebrow">CONTINUITY / AUTOMATIC VIDEO REVIEW</p><h1>{view === "studio" ? "Analysis studio" : "Saved analyses"}</h1><p>One video. Automatic sampled comparisons. Human judgment stays in control.</p></div><span className="version-tag"><ShieldCheck size={14} /> LOCAL WORKSPACE · NO AUTH</span></div>
   <div className="scope-fields"><label>Project ID<input id="project-id" aria-label="Project ID" maxLength={120} value={scope.projectId} disabled={!!busy} onChange={e => changeScope("projectId", e.target.value)} /></label><label>Scene ID<input aria-label="Scene ID" maxLength={120} value={scope.sceneId} disabled={!!busy} onChange={e => changeScope("sceneId", e.target.value)} /></label><p>Explicit project / scene scope. Local-only access: no authentication or private-user isolation.</p></div>
   {healthError && <div className="error" role="alert">Health check failed. Paid analysis stays disabled. <button onClick={() => setHealthRefresh(v => v + 1)}>Retry health check</button></div>}
   {health && !health.paidAnalysisEnabled && <p className="notice">Paid analysis disabled by server. Saved reviews remain available. No analysis call will be sent.</p>}
   {error && <p className="error" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
   {busy && <p className="notice" role="status"><LoaderCircle size={14} className="spin" /> {busy === "analyze" ? "Uploading and analyzing sampled video frames…" : busy === "review" ? "Saving review…" : "Loading stored analysis…"} {busy !== "review" && <button className="secondary" onClick={cancel}><X size={13} /> Cancel request</button>}</p>}
   {view === "history" ? <section className="history-list" aria-label="Saved analyses" aria-busy={historyStatus === "loading"}><h2>Stored analyses / {scope.projectId} / {scope.sceneId}</h2>{historyStatus === "idle" && <p>Choose Saved to load analyses for this project and scene.</p>}{historyStatus === "loading" && <p role="status">Loading saved analyses…</p>}{historyStatus === "error" && <div className="empty-analysis"><FolderOpen size={24} aria-hidden="true" /><h3>Saved analyses could not be loaded.</h3><p>Your saved work has not been changed. Retry to check this project and scene.</p><button className="secondary" disabled={!!busy || !scopeValid} onClick={loadHistory}>Retry saved analyses</button></div>}{historyStatus === "ready" && !history.length && <div className="empty-analysis"><FolderOpen size={24} aria-hidden="true" /><h3>No stored analyses in this scope.</h3><p>Analyze a video to create the first saved entry.</p></div>}{history.map(entry => <button className="history-entry" key={entry.analysisId} disabled={!!busy} onClick={() => openAnalysis(entry.analysisId)}><Film size={18} /><span>{entry.clipName}<small>{new Date(entry.createdAt).toLocaleString()} · {entry.findings.length} findings · {entry.persistence.mode}</small></span><ChevronRight size={18} /></button>)}</section> : <>
    <VideoImport disabled={!!busy} clip={clip} analysis={analysis} activeId={finding?.id || null} seek={seek} onFile={chooseFile} onReady={setReady} onFinding={selectFinding} />
    {!analysis && <section className="context-panel"><div className="section-label"><span>02 / ANALYSIS CONTEXT</span><small>OPTIONAL</small></div><label htmlFor="scene-context">Scene context / continuity intent</label><textarea id="scene-context" value={context} maxLength={4000} disabled={!!busy} onChange={e => setContext(e.target.value)} placeholder="Wardrobe, props, intentional changes, scene notes…" /><p className="sampling-note">Automatic sampled comparisons, not an exhaustive frame-by-frame check. Sampling may miss continuity mistakes. Browser checks 15–60 seconds; server duration and file validation are authoritative.</p><div className="consent-stack"><label className="consent"><input type="checkbox" checked={consent} disabled={!!busy} onChange={e => setConsent(e.target.checked)} /><span>I consent to uploading and persistently storing this video and extracted frames on this server, and sending selected keyframes and context to Gemini.</span></label><label className="consent"><input type="checkbox" checked={costApproved} disabled={!!busy} onChange={e => setCostApproved(e.target.checked)} /><span>I approve potential Gemini cost for this analysis request. Approval resets after each request.</span></label><label className="consent"><input type="checkbox" checked={memoryConsent} disabled={!!busy || !health?.memoryConfigured} onChange={e => setMemoryConsent(e.target.checked)} /><span>Use remote continuity memory for this request (optional; {health?.memoryConfigured ? "configured" : "not configured"}).</span></label></div><div className="analysis-action"><p>Selection alone never uploads. No manual frame selection.</p><button className="primary" disabled={!!busy || !clip || !ready || !scopeValid || !consent || !costApproved || !health?.geminiConfigured || !health.paidAnalysisEnabled} onClick={analyze}><Sparkles size={16} /> Analyze Continuity</button></div></section>}
    {analysis && <section className="analysis-results"><div className="results-heading"><div><small>02 / SAMPLED FINDINGS</small><h2>{analysis.findings.length} potential continuity {analysis.findings.length === 1 ? "issue" : "issues"}</h2></div><span>{analysis.frames.length} extracted frames · {analysis.pairs.length} sampled comparisons</span></div><p>{analysis.summary}</p><button className="secondary" onClick={exportJson}>Export JSON</button><small> Stored analysis{dirty ? " + separately labeled unsaved draft" : " and saved reviews"}</small><p className="sampling-note">Automatic sampled comparisons may miss mistakes. Evidence and uncertainty below are server-returned; findings are not confirmed facts.</p><div className="persistence-note"><b>{analysis.persistence.mode === "local" ? "Local persistent fallback — stored on this server, not Postgres." : "Postgres persistence — analysis and reviews saved."}</b>{analysis.persistence.warning && <p>{analysis.persistence.warning}</p>}{analysis.memory.warning && <p>{analysis.memory.warning}</p>}{analysis.memory.facts?.map(f => <p key={f.id}>{f.content}</p>)}</div>
     <div className="findings-layout"><div className="finding-list">{!analysis.findings.length && <p>No issues found in sampled comparisons. This does not prove continuity is error-free.</p>}{analysis.findings.map((f, index) => { const p = analysis.pairs.find(p => p.id === f.pairId)!; const c = analysis.frames.find(frame => frame.id === p.candidateFrameId)!; return <button key={f.id} className={`finding-card ${f.id === activeId ? "selected" : ""}`} disabled={!!busy} onClick={() => selectFinding(f.id)}><small>{String(index + 1).padStart(2, "0")} / {f.category.toUpperCase()} · {formatTime(c.timeSeconds)}</small><strong>{f.description}</strong><span className="status-badge">{f.status}</span></button>; })}</div>
     <section className="evidence-panel" aria-label="Finding evidence">{finding && reference && candidate ? <><h3>{finding.description}</h3><div className="evidence-frames"><figure><img src={mediaUrl(analysis.analysisId, reference.id)} alt={`Reference evidence at ${formatTime(reference.timeSeconds)}`} /><figcaption><button className="evidence-seek" aria-label={`Jump to reference at ${formatTime(reference.timeSeconds)}`} onClick={() => setSeek({ time: reference.timeSeconds, nonce: Date.now() })}>Reference · {formatTime(reference.timeSeconds, true)} <ChevronRight size={13} /></button><span>Sampled frame · shot {reference.shotId}</span></figcaption></figure><figure><img src={mediaUrl(analysis.analysisId, candidate.id)} alt={`Candidate evidence at ${formatTime(candidate.timeSeconds)}`} /><figcaption><button className="evidence-seek" aria-label={`Jump to candidate at ${formatTime(candidate.timeSeconds)}`} onClick={() => setSeek({ time: candidate.timeSeconds, nonce: Date.now() })}>Candidate · {formatTime(candidate.timeSeconds, true)} <ChevronRight size={13} /></button><span>Sampled frame · shot {candidate.shotId}</span></figcaption></figure></div><dl><dt>Reference evidence</dt><dd>{finding.referenceEvidence}</dd><dt>Candidate evidence</dt><dd>{finding.candidateEvidence}</dd><dt>Uncertainty</dt><dd>{finding.uncertainty}</dd><dt>Suggested action</dt><dd>{finding.suggestedAction}</dd></dl><label className="review-label">Review outcome<select aria-label="Review outcome" disabled={!!busy} value={review.status} onChange={e => setReview({ ...review, status: e.target.value as Status })}><option value="unreviewed">Unreviewed</option><option value="confirmed">Confirmed</option><option value="dismissed">Dismissed</option><option value="intentional">Intentional</option></select></label><label className="review-label">Review note<textarea aria-label="Review note" maxLength={4000} disabled={!!busy} value={review.note} onChange={e => setReview({ ...review, note: e.target.value })} /></label><label className="consent"><input type="checkbox" checked={reviewConsent} disabled={!!busy || !health?.memoryConfigured} onChange={e => setReviewConsent(e.target.checked)} /><span>Share this review with remote continuity memory (optional).</span></label><div className="analysis-action"><span>{dirty ? "Unsaved changes" : "Stored review"}</span><button className="primary" disabled={!!busy || review.status === "unreviewed" || !dirty} onClick={saveReview}><Check size={15} /> Save review</button></div></> : <div className="evidence-empty"><ScanLine size={28} /><h3>Select a timestamped finding</h3><p>Seek to its candidate frame and inspect both supporting extracted frames.</p></div>}</section></div>
    </section>}
   </>}
   <footer className="workspace-footer"><span>CONTINUITYGHOST / VIDEO WORKSPACE</span><span>Only project, scene, and last analysis ID are remembered in browser storage. Media stays on server after analysis.</span></footer>
  </main></div>
 </div>;
}
