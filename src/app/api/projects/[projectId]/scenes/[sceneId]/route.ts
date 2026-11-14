import {getScene} from '../../../../../../lib/resources';
import {json,resourceResponse,scope,type ResourceContext} from '../../../../../../lib/resource-http';
export const runtime='nodejs';
export async function GET(request:Request,context:ResourceContext){return resourceResponse(request,async()=>{const {projectId,sceneId}=await scope(context);return json(await getScene(projectId,sceneId));});}
