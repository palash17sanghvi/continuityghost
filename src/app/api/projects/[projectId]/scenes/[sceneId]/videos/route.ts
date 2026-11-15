import {json,pagination,resourceResponse,scope,type ResourceContext} from '../../../../../../../lib/resource-http';
import {listVideos} from '../../../../../../../lib/video-store';
import {uploadVideo} from '../../../../../../../lib/video-service';
export const runtime='nodejs';
export const maxDuration=90;
export async function GET(request:Request,context:ResourceContext){return resourceResponse(request,async()=>{const {projectId,sceneId}=await scope(context);const {limit,offset}=pagination(request);return json(await listVideos(projectId,sceneId,limit,offset));});}
export async function POST(request:Request,context:ResourceContext){return resourceResponse(request,async()=>{const {projectId,sceneId}=await scope(context);return json({video:await uploadVideo(request,projectId,sceneId)},201);});}
