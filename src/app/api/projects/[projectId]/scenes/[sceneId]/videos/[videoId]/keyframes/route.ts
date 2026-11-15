import {json,resourceResponse,scope,type ResourceContext} from '../../../../../../../../../lib/resource-http';
import {listKeyframes} from '../../../../../../../../../lib/video-store';
export const runtime='nodejs';
export async function GET(request:Request,context:ResourceContext){return resourceResponse(request,async()=>{const {projectId,sceneId,videoId}=await scope(context);return json({items:await listKeyframes(projectId,sceneId,videoId)});});}
