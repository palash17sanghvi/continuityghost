import {z} from 'zod';
import {requireBackendAuth} from './backend-auth';
import {ResourceError} from './resources';

/** Resources are a single-owner shared workspace, not per-user/tenant storage. */
export const resourceId=z.string().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
export const createResourceSchema=z.object({id:resourceId,name:z.string().min(1).max(200).refine(v=>v.trim().length>0)}).strict();
export type ResourceContext={params:Promise<Record<string,string>>};
export class HttpError extends Error {constructor(public status:number,message:string){super(message);}}
export function json(data:unknown,status=200):Response {return Response.json(data,{status,headers:{'Cache-Control':'no-store'}});}
export async function readJson(request:Request,maxBytes=4096):Promise<unknown> {
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new HttpError(400,'Expected JSON body.');
 const length=request.headers.get('content-length');
 if(length && /^\d+$/.test(length) && Number(length)>maxBytes)throw new HttpError(413,'Request body too large.');
 const reader=request.body?.getReader();if(!reader)throw new HttpError(400,'Missing JSON body.');
 const decoder=new TextDecoder('utf-8',{fatal:true});let text='';let bytes=0;
 try {
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maxBytes){await reader.cancel();throw new HttpError(413,'Request body too large.');}text+=decoder.decode(value,{stream:true});}
  text+=decoder.decode();return JSON.parse(text);
 }catch(error){if(error instanceof HttpError)throw error;throw new HttpError(400,'Invalid JSON body.');}
 finally {reader.releaseLock();}
}
export function readJsonBody(request:Request):Promise<unknown> {return readJson(request,24000);}
export function parse<T>(schema:z.ZodType<T>,input:unknown):T {
 const parsed=schema.safeParse(input);if(!parsed.success)throw new HttpError(400,'Invalid request fields.');return parsed.data;
}
export async function scope(context:ResourceContext):Promise<Record<string,string>> {
 const params=await context.params;
 for(const [key,value] of Object.entries(params)){
  const valid=key==='analysisId'?z.string().uuid().safeParse(value).success:resourceId.safeParse(value).success;
  if(!valid)throw new HttpError(404,'Resource not found.');
 }
 return params;
}
export function pagination(request:Request):{limit:number;offset:number} {
 const query=new URL(request.url).searchParams;
 const integer=(key:string,fallback:number,min:number,max:number)=>{
  const entries=query.getAll(key);if(!entries.length)return fallback;
  if(entries.length!==1 || !/^\d+$/.test(entries[0]))throw new HttpError(400,'Invalid pagination.');
  const value=Number(entries[0]);if(!Number.isSafeInteger(value)||value<min||value>max)throw new HttpError(400,'Invalid pagination.');return value;
 };
 return {limit:integer('limit',50,1,100),offset:integer('offset',0,0,1000000)};
}
export async function resourceResponse(request:Request,action:()=>Promise<Response>):Promise<Response> {
 const denied=requireBackendAuth(request);if(denied)return denied;
 try{return await action();}catch(error){
  if(error instanceof HttpError)return json({error:error.message},error.status);
  if(error instanceof ResourceError){const status=error.status;return json({error:status===404?'Resource not found.':status===409?'Resource already exists.':status===400?'Invalid resource request.':'Resource operation unavailable.'},status>=400&&status<=599?status:503);}
  return json({error:'Resource operation unavailable.'},503);
 }
}
