export const categories = ["wardrobe", "props", "placement", "appearance", "action", "background"] as const;
export type Status = "unreviewed" | "confirmed" | "dismissed" | "intentional";
export type Finding = { id: string; category: typeof categories[number]; description: string; referenceEvidence: string; candidateEvidence: string; uncertainty: string; suggestedAction: string; status: Status; note?: string };
export type Memory = { status: string; facts?: { id: string; content: string; source: string }[]; warning?: string };
export type Analysis = { memory?: Memory; persistence?: { status: "saved" | "disabled" | "failed"; warning?: string }; analysisId: string; projectId: string; sceneId: string; summary: string; findings: Finding[] };
export type Health = { geminiConfigured: boolean; model: string; paidAnalysisEnabled?: boolean; memoryConfigured: boolean; databaseConfigured: boolean };
export type Analytics = { categories: { category: string; count: number }[]; outcomes: { status: string; count: number }[]; trends: { bucket: string; count: number }[]; totals: { analyses: number; findings: number; reviews: number }; timeSeriesMode: "timescale" | "postgres" };
export type FrameSource = { name: string; type: string; size: number; video?: { name: string; timeSeconds: number } };
export type SessionEntry = { analysis: Analysis; context: string; reference: File; candidate: File; sourceFiles: { reference: FrameSource; candidate: FrameSource }; savedReviews: Record<string, string> };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export function validAnalysis(value: unknown): value is Analysis {
  if (!object(value)) return false;
  const a = value;
  if (a.memory !== undefined) {
    if (!object(a.memory)) return false;
    const m = a.memory;
    if (typeof m.status !== "string" || !m.status || (m.warning !== undefined && typeof m.warning !== "string") || (m.facts !== undefined && (!Array.isArray(m.facts) || !m.facts.every(f => object(f) && ["id", "content", "source"].every(k => typeof f[k] === "string"))))) return false;
  }
  if (a.persistence !== undefined) {
    if (!object(a.persistence) || !["saved", "disabled", "failed"].includes(String(a.persistence.status)) || (a.persistence.warning !== undefined && typeof a.persistence.warning !== "string")) return false;
  }
  return ["analysisId", "projectId", "sceneId", "summary"].every(k => typeof a[k] === "string" && (a[k] as string).trim().length > 0) && Array.isArray(a.findings) && a.findings.every(f => object(f) && ["id", "description", "referenceEvidence", "candidateEvidence", "uncertainty", "suggestedAction"].every(k => typeof f[k] === "string") && typeof f.id === "string" && !!f.id.trim() && categories.includes(f.category as typeof categories[number]) && f.status === "unreviewed") && new Set(a.findings.map(f => f.id)).size === a.findings.length;
}
export function validAnalytics(value: unknown): value is Analytics {
  if (!object(value) || !["timescale", "postgres"].includes(String(value.timeSeriesMode)) || !object(value.totals)) return false;
  const count = (n: unknown) => typeof n === "number" && Number.isFinite(n) && Number.isInteger(n) && n >= 0;
  return [value.totals.analyses, value.totals.findings, value.totals.reviews].every(count) && [["categories", "category"], ["outcomes", "status"], ["trends", "bucket"]].every(([key, label]) => Array.isArray(value[key]) && value[key].every((row: unknown) => object(row) && typeof row[label] === "string" && count(row.count)));
}
export function fileSource(file: File): FrameSource { return { name: file.name, type: file.type, size: file.size }; }
export function imageError(file: File): string | null {
  return !["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size || file.size > 8 * 1024 * 1024 ? "Choose a JPEG, PNG, or WebP image, no larger than 8 MiB and not empty." : null;
}
export function errorMessage(data: unknown, fallback: string): string {
  if (!object(data)) return fallback;
  if (typeof data.error === "string") return data.error;
  return object(data.error) && typeof data.error.message === "string" ? data.error.message : fallback;
}
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}
