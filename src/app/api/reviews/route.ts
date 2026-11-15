import {z} from 'zod';
import {saveReview} from '../../../lib/workflow';
import {isSameOriginRequest} from '../../../lib/request-origin';
export const runtime='nodejs';
const schema=z.object({analysisId:z.string().uuid(),findingId:z.string().uuid(),projectId:z.string().trim().min(1).max(120),sceneId:z.string().trim().min(1).max(120),status:z.enum(['confirmed','dismissed','intentional']),note:z.string().trim().max(4000),consent:z.boolean()});
export async function POST(request:Request){
 if(!isSameOriginRequest(request))return Response.json({error:'Cross-origin review is not allowed.'},{status:403});
 try{
  if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'Expected JSON review.'},{status:400});
  const reader=request.body?.getReader();if(!reader)return Response.json({error:'Missing review.'},{status:400});
  let text='';let size=0;const decoder=new TextDecoder();
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>24000){await reader.cancel();return Response.json({error:'Review too large.'},{status:413});}text+=decoder.decode(value,{stream:true});}
  text+=decoder.decode();
  const parsed=schema.safeParse(JSON.parse(text));if(!parsed.success)return Response.json({error:'Invalid review fields.'},{status:400});
  return Response.json(await saveReview(parsed.data),{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Review could not be saved. Check database configuration and analysis scope. Local review is unchanged.'},{status:503});}
}
