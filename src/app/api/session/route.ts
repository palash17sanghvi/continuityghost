import {z} from 'zod';
import {backendToken,checkMutationOrigin,sessionCookie,validBackendToken} from '../../../lib/backend-auth';
import {HttpError,json,parse,readJson} from '../../../lib/resource-http';
export const runtime='nodejs';
const credentials=z.object({token:z.string().min(1).max(4096)}).strict();
export async function POST(request:Request):Promise<Response> {
 const forbidden=checkMutationOrigin(request);if(forbidden)return forbidden;
 if(!backendToken())return json({error:'Configure server BACKEND_API_TOKEN with at least 32 characters.'},503);
 try {
  const {token}=parse(credentials,await readJson(request));
  if(!validBackendToken(token))return json({error:'Invalid backend token.'},401);
  return Response.json({authenticated:true},{headers:{'Cache-Control':'no-store','Set-Cookie':sessionCookie(request)}});
 }catch(error){return error instanceof HttpError?json({error:error.message},error.status):json({error:'Session unavailable.'},503);}
}
export async function DELETE(request:Request):Promise<Response> {
 const forbidden=checkMutationOrigin(request);if(forbidden)return forbidden;
 return Response.json({authenticated:false},{headers:{'Cache-Control':'no-store','Set-Cookie':sessionCookie(request,true)}});
}
