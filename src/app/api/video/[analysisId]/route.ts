import { getVideo, VideoStoreError } from '../../../../lib/video-store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ analysisId: string }> }) {
  try {
    const { analysisId } = await context.params;
    const result = await getVideo(analysisId);
    return result ? Response.json(result, { headers: { 'Cache-Control': 'no-store' } }) : Response.json({ error: 'Video not found.' }, { status: 404 });
  } catch (error) { return Response.json({ error: 'Video unavailable.' }, { status: error instanceof VideoStoreError ? error.status : 503 }); }
}
