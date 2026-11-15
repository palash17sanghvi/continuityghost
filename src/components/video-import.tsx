"use client";
import { useEffect, useRef, useState } from "react";
import { Film, Upload } from "lucide-react";
import { formatTime, mediaUrl } from "@/lib/client-analysis";
import type { VideoAnalysis } from "@/lib/video-contract";

type Props = { disabled: boolean; clip: File | null; analysis: VideoAnalysis | null; seek: { time: number; nonce: number } | null; onFile: (file: File | null) => boolean; onReady: (ready: boolean) => void; onFinding: (id: string) => void };
export default function VideoImport({ disabled, clip, analysis, seek, onFile, onReady, onFinding }: Props) {
 const [preview, setPreview] = useState("");
 const [time, setTime] = useState(0);
 const [duration, setDuration] = useState(0);
 const [error, setError] = useState("");
 const input = useRef<HTMLInputElement>(null);
 const player = useRef<HTMLVideoElement>(null);
 useEffect(() => {
  const video = player.current;
  if (video && seek) { video.pause(); video.currentTime = seek.time; }
 }, [seek]);
 useEffect(() => {
  if (!clip) return;
  const url = URL.createObjectURL(clip);
  queueMicrotask(() => setPreview(url));
  return () => URL.revokeObjectURL(url);
 }, [clip]);
 const src = analysis ? mediaUrl(analysis.analysisId) : clip ? preview : "";
 function choose(file?: File) {
  if (!file || disabled) return;
  if (!["video/mp4", "video/webm", "video/quicktime"].includes(file.type) || !file.size || file.size > 64 * 1024 ** 2) { setError("Choose a non-empty MP4, WebM, or MOV video, at most 64 MiB."); return; }
  if (!onFile(file)) return;
  onReady(false); setError(""); setDuration(0); setTime(0);
 }
 function metadata() {
  const video = player.current;
  if (!video) return;
  if (!Number.isFinite(video.duration)) { onReady(true); return; }
  if (!analysis && (video.duration < 15 || video.duration > 60)) { onReady(false); setError("Video must be 15–60 seconds. Server validates duration again."); return; }
  setDuration(video.duration); onReady(true);
 }
 return <section className="video-import" aria-label="Video upload and timeline">
  <header><div><small>01 / SOURCE CLIP</small><h2><Film size={18} /> {analysis?.clipName || clip?.name || "One clip. Automatic comparisons."}</h2></div><button className="secondary" disabled={disabled} onClick={() => input.current?.click()}><Upload size={15} /> {clip || analysis ? "Replace video" : "Upload video"}</button></header>
  <input ref={input} aria-label="Upload video" type="file" accept="video/mp4,video/webm,video/quicktime" hidden disabled={disabled} onChange={e => { choose(e.target.files?.[0]); e.target.value = ""; }} />
  {src ? <video key={src} ref={player} src={src} controls playsInline preload="metadata" aria-label="Continuity video player" onLoadedMetadata={metadata} onDurationChange={metadata} onTimeUpdate={() => { const video = player.current; if (!video) return; setTime(video.currentTime); }} onError={() => { onReady(false); setError("Video could not be played. Try a browser-supported MP4 or WebM, or reopen stored analysis."); }} /> : <div className="video-empty"><Film size={40} /><h3>Upload a scene to begin</h3><p>15–60 seconds · up to 64 MiB · MP4 / WebM / MOV</p><p>Selection stays in this browser. Nothing uploads until Analyze Continuity.</p></div>}
  <div className="video-transport"><span>{formatTime(time)}</span><input type="range" aria-label="Video timeline" min={0} max={analysis?.duration || duration || 1} step="0.01" value={Math.min(time, analysis?.duration || duration || 1)} disabled={!src || !(duration || analysis?.duration)} onChange={e => { if (player.current) { player.current.currentTime = Number(e.target.value); setTime(Number(e.target.value)); } }} /><span>{formatTime(analysis?.duration || duration)}</span></div>
  {analysis && <div className="issue-timeline" aria-label="Timestamped issue markers">{analysis.findings.map((finding, index) => {
   const pair = analysis.pairs.find(p => p.id === finding.pairId)!;
   const frame = analysis.frames.find(f => f.id === pair.candidateFrameId)!;
   return <button key={finding.id} style={{ left: `${Math.max(3, Math.min(97, frame.timeSeconds / analysis.duration * 100))}%` }} aria-label={`Issue ${index + 1} at ${formatTime(frame.timeSeconds)}`} title={finding.description} onClick={() => onFinding(finding.id)}>{index + 1}<small>{formatTime(frame.timeSeconds)}</small></button>;
  })}</div>}
  {error && <p role="alert" className="error">{error}</p>}
 </section>;
}
