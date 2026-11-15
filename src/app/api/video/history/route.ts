import { z } from 'zod';
import { listVideos, VideoStoreError } from '../../../../lib/video-store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const url = new URL(request.url);
  const scope = z.object({ projectId: z.string().trim().min(1).max(120), sceneId: z.string().trim().min(1).max(120) }).safeParse({ projectId: url.searchParams.get('projectId'), sceneId: url.searchParams.get('sceneId') });
  if (!scope.success) return Response.json({ error: 'Project and scene are required.' }, { status: 400 });
  try { return Response.json({ analyses: await listVideos(scope.data.projectId, scope.data.sceneId) }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return Response.json({ error: 'Video history unavailable.' }, { status: error instanceof VideoStoreError ? error.status : 503 }); }
}
