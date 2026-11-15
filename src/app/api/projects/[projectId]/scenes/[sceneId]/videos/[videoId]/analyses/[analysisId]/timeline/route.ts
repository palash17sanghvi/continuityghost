import {json,resourceResponse,scope,type ResourceContext} from '../../../../../../../../../../../lib/resource-http';
import {getTimeline} from '../../../../../../../../../../../lib/video-store';
export const runtime='nodejs';
export async function GET(request:Request,context:ResourceContext){return resourceResponse(request,async()=>{const {projectId,sceneId,videoId,analysisId}=await scope(context);return json(await getTimeline(projectId,sceneId,videoId,analysisId));});}
