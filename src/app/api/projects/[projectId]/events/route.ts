import {getEvents} from '../../../../../lib/resources';
import {json,resourceResponse,scope,pagination,parse,resourceId,HttpError,type ResourceContext} from '../../../../../lib/resource-http';
export const runtime='nodejs';
export async function GET(request:Request,context:ResourceContext){return resourceResponse(request,async()=>{const {projectId}=await scope(context);const query=new URL(request.url).searchParams;const values=query.getAll('sceneId');if(values.length>1)throw new HttpError(400,'Invalid sceneId.');const sceneId=values.length?parse(resourceId,values[0]):undefined;return json(await getEvents(projectId,{sceneId,...pagination(request)}));});}
