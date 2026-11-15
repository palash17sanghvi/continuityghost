import {json,resourceResponse,scope,type ResourceContext} from '../../../../../../../../../../lib/resource-http';
import {getAnalysis} from '../../../../../../../../../../lib/video-store';
export const runtime='nodejs';
export async function GET(request:Request,context:ResourceContext){return resourceResponse(request,async()=>{const {projectId,sceneId,videoId,analysisId}=await scope(context);return json({analysis:await getAnalysis(projectId,sceneId,videoId,analysisId)});});}
