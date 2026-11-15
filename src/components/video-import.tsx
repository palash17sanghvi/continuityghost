"use client";

import { useEffect, useRef, useState } from "react";
import { Film, Upload } from "lucide-react";
import { formatTime, type FrameSource } from "@/lib/client-analysis";

type Props = { disabled: boolean; active: boolean; onFrame: (slot: "reference" | "candidate", file: File, source: FrameSource) => void };
export default function VideoImport({ disabled, active, onFrame }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const url = useRef<string | null>(null);
  const generation = useRef(0);
  const [clip, setClip] = useState<File | null>(null);
  const [src, setSrc] = useState("");
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => { generation.current++; if (url.current) URL.revokeObjectURL(url.current); }, []);
  useEffect(() => { if (!active || disabled) video.current?.pause(); }, [active, disabled]);
  function importClip(file?: File) {
    if (!file || disabled || capturing) return;
    if (!file.type.startsWith("video/") || !file.size || file.size > 1024 ** 3) { setError("Choose a non-empty browser-supported video, at most 1 GiB. Video stays on this device."); return; }
    generation.current++;
    if (url.current) URL.revokeObjectURL(url.current);
    const next = URL.createObjectURL(file); url.current = next;
    setClip(file); setSrc(next); setDuration(0); setTime(0); setReady(false); setError("");
  }
  async function capture(slot: "reference" | "candidate") {
    const player = video.current;
    if (!player || !clip || !ready || player.seeking || player.readyState < 2 || disabled || capturing) return;
    player.pause();
    const current = generation.current;
    const capturedTime = player.currentTime;
    setCapturing(true); setError("");
    try {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 2560 / Math.max(player.videoWidth, player.videoHeight));
      canvas.width = Math.max(1, Math.round(player.videoWidth * scale)); canvas.height = Math.max(1, Math.round(player.videoHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas capture is unavailable in this browser. Upload two still images instead.");
      ctx.drawImage(player, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Frame capture failed. Try another position or upload still images.")), "image/jpeg", 0.92));
      if (current !== generation.current) return;
      if (blob.size > 8 * 1024 * 1024) throw new Error("Captured frame exceeds 8 MiB. Upload a smaller still image instead.");
      const file = new File([blob], `${clip.name.replace(/\.[^.]+$/, "")}-${capturedTime.toFixed(3)}s.jpg`, { type: "image/jpeg" });
      onFrame(slot, file, { name: file.name, type: file.type, size: file.size, video: { name: clip.name, timeSeconds: capturedTime } });
    } catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : "Frame capture failed."); }
    finally { if (current === generation.current) setCapturing(false); }
  }
  return <section className="video-import" aria-labelledby="video-heading">
    <header className="section-header"><div><small>LOCAL FOOTAGE</small><h2 id="video-heading"><Film size={17} /> Video workspace</h2></div><label className={`button secondary ${disabled || capturing ? "disabled" : ""}`}><Upload size={14} /> Import video<input className="sr-only" aria-label="Import local video" type="file" accept="video/*" disabled={disabled || capturing} onChange={e => { importClip(e.target.files?.[0]); e.target.value = ""; }} /></label></header>
    <p className="fine-print">Local playback only. Select two frames, then analyze them. No full-video scan; no video upload. Captures use JPEG, up to 2560 px.</p>
    {src ? <><video ref={video} src={src} controls playsInline preload="metadata" aria-label="Local video player" onLoadedMetadata={e => { const d = e.currentTarget.duration; setDuration(Number.isFinite(d) ? d : 0); }} onDurationChange={e => { const d = e.currentTarget.duration; if (Number.isFinite(d)) setDuration(d); }} onLoadedData={() => setReady(true)} onSeeking={() => setReady(false)} onSeeked={() => setReady(true)} onTimeUpdate={e => setTime(e.currentTarget.currentTime)} onError={() => { setReady(false); setError("This browser cannot decode this video. Try MP4/H.264 or upload still images."); }} />
      <div className="timeline"><span>{formatTime(time)}</span><input aria-label="Video position" type="range" min="0" max={duration || 0} step="0.01" value={Math.min(time, duration)} disabled={!duration || capturing || disabled} onChange={e => { if (video.current) { const t = Number(e.target.value); setReady(false); video.current.currentTime = t; setTime(t); } }} /><span>{formatTime(duration)}</span></div>
      <div className="capture-actions"><span className="clip-name">{clip?.name}</span><button disabled={disabled || !ready || capturing} onClick={() => capture("reference")}>Set reference frame</button><button disabled={disabled || !ready || capturing} onClick={() => capture("candidate")}>Set candidate frame</button></div></> : <div className="video-empty"><Film size={28} /><span>Import footage to select your own comparison frames.</span><small>Or upload two still images below.</small></div>}
    {error && <p role="alert" className="error">{error}</p>}
  </section>;
}
