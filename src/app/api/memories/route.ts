import {z} from 'zod';
import {requireBackendAuth} from '../../../lib/backend-auth';
import {loadMemory} from '../../../lib/workflow';
const input=z.object({projectId:z.string().trim().min(1).max(120),sceneId:z.string().trim().min(1).max(120),query:z.string().trim().min(1).max(1000),consent:z.literal(true)});
// POST explicitly requests external retrieval. No background reads, writes or retries.
export async function POST(request:Request){
 const denied=requireBackendAuth(request);if(denied)return denied;
 try{
  const {readJsonBody}=await import('../../../lib/resource-http');
  const parsed=input.safeParse(await readJsonBody(request));
  if(!parsed.success)return Response.json({error:'Project, scene and bounded query required.'},{status:400});
  return Response.json(await loadMemory(parsed.data.projectId,parsed.data.sceneId,parsed.data.query,true),{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Invalid memory retrieval request.'},{status:400});}
}
