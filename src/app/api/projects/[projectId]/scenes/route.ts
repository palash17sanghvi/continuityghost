import {createScene,listScenes} from '../../../../../lib/resources';
import {json,resourceResponse,createResourceSchema,parse,readJson,scope,type ResourceContext} from '../../../../../lib/resource-http';
export const runtime='nodejs';
export async function GET(request:Request,context:ResourceContext){return resourceResponse(request,async()=>{const {projectId}=await scope(context);return json(await listScenes(projectId));});}
export async function POST(request:Request,context:ResourceContext){return resourceResponse(request,async()=>{const {projectId}=await scope(context);const data=parse(createResourceSchema,await readJson(request));return json(await createScene({projectId,...data}),201);});}
