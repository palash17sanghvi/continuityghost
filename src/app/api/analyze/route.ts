import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { analyzeImages, MAX_IMAGE_BYTES, responseSchema, validateImage } from '../../../lib/continuity';

export const runtime = 'nodejs';
export const maxDuration = 60;
const MAX_BODY = MAX_IMAGE_BYTES * 2 + 100_000;
const fields = z.object({projectId:z.string().trim().min(1).max(120),sceneId:z.string().trim().min(1).max(120),context:z.string().max(12000),consent:z.literal('true'),costApproved:z.literal('true')});
const error = (message:string,status:number)=>Response.json({error:message},{status});

export async function POST(request:Request) {
  const url=new URL(request.url);
  if (request.headers.get('origin') && request.headers.get('origin') !== url.origin) return error('Cross-origin analysis is not allowed.',403);
  if (!process.env.GEMINI_API_KEY) return error('Gemini is not configured. Add GEMINI_API_KEY to .env.local.',503);
  if (process.env.ALLOW_PAID_ANALYSIS !== 'true') return error('Paid analysis is disabled. Owner must approve before setting ALLOW_PAID_ANALYSIS=true.',403);
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length)>MAX_BODY)) return error('Upload exceeds the request limit.',413);
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) return error('Expected image upload form.',400);
  let form:FormData;
  try {
    // Bound streamed bodies too: Content-Length can be absent or untrusted.
    const reader=request.body?.getReader();
    if (!reader) return error('Missing upload body.',400);
    const chunks:Uint8Array[]=[];
    let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY){await reader.cancel();return error('Upload exceeds the request limit.',413);}chunks.push(value);}
    form=await new Response(Buffer.concat(chunks),{headers:{'content-type':request.headers.get('content-type')!}}).formData();
  } catch {return error('Malformed upload form.',400);}
  const parsed=fields.safeParse(Object.fromEntries(['projectId','sceneId','context','consent','costApproved'].map(k=>[k,form.get(k)??''])));
  if (!parsed.success) return error('Provide project, scene, context under 12,000 characters, data consent and cost approval.',400);
  const reference=form.get('reference'), candidate=form.get('candidate');
  if (!(reference instanceof File) || !(candidate instanceof File)) return error('Upload both reference and candidate images.',400);
  let images;
  try {images=await Promise.all([validateImage(reference),validateImage(candidate)]);} catch(e){return error(e instanceof Error?e.message:'Invalid images.',400);}
  try {
    const { GEMINI_API_KEY: apiKey } = process.env;
    const ai=new GoogleGenAI({apiKey,httpOptions:{timeout:45000}});
    const result=await analyzeImages({...parsed.data,reference:images[0],candidate:images[1]},async parts=>{
      const response=await ai.models.generateContent({model:process.env.GEMINI_MODEL || 'gemini-2.5-flash',contents:[{role:'user',parts}],config:{responseMimeType:'application/json',responseJsonSchema:z.toJSONSchema(responseSchema),maxOutputTokens:6000,temperature:0.2}});
      if (!response.text) throw new Error('Empty model response');
      return response.text;
    });
    return Response.json(result,{headers:{'Cache-Control':'no-store'}});
  } catch {
    // Provider errors may contain submitted data; never expose/log raw exceptions.
    return error('Gemini analysis failed or returned invalid findings. Check model access, quota and configuration before retrying; requests may incur charges.',502);
  }
}
