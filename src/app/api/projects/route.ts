import {createProject,listProjects} from '../../../lib/resources';
import {json,resourceResponse,createResourceSchema,parse,readJson} from '../../../lib/resource-http';
export const runtime='nodejs';
export async function GET(request:Request){return resourceResponse(request,async()=>json(await listProjects()));}
export async function POST(request:Request){return resourceResponse(request,async()=>json(await createProject(parse(createResourceSchema,await readJson(request))),201));}
