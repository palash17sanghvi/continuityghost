import {json,resourceResponse,scope,type ResourceContext} from '../../../../../../../../lib/resource-http';
import {getVideo} from '../../../../../../../../lib/video-store';
export const runtime='nodejs';
export async function GET(request:Request,context:ResourceContext){return resourceResponse(request,async()=>{const {projectId,sceneId,videoId}=await scope(context);return json({video:await getVideo(projectId,sceneId,videoId)});});}
