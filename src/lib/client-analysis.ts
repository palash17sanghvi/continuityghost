import { videoAnalysisSchema, type VideoAnalysis } from "./video-contract";
export type Health = { geminiConfigured: boolean; model: string; paidAnalysisEnabled?: boolean; memoryConfigured: boolean; databaseConfigured: boolean };
export type Status = VideoAnalysis["findings"][number]["status"];
export function formatTime(seconds: number, precise = false) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${precise ? (seconds % 60).toFixed(2).padStart(5, "0") : Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}
export function parseVideoAnalysis(value: unknown, scope: { projectId: string; sceneId: string }, analysisId?: string): VideoAnalysis {
  const parsed = videoAnalysisSchema.safeParse(value);
  if (!parsed.success || parsed.data.duration < 15 || parsed.data.duration > 60 || parsed.data.projectId !== scope.projectId || parsed.data.sceneId !== scope.sceneId || (analysisId && parsed.data.analysisId !== analysisId)) throw new Error("Invalid video analysis response. Duration, scope, or evidence references are invalid. No results displayed.");
  return parsed.data;
}
export async function responseJson(response: Response): Promise<unknown> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : `Request failed (${response.status}).`;
    throw new Error(message);
  }
  return body;
}
export function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Request failed. Try again."; }
export function mediaUrl(analysisId: string, frameId?: string) { return `/api/video/${encodeURIComponent(analysisId)}/media${frameId ? `?frameId=${encodeURIComponent(frameId)}` : ""}`; }
