import {readFile} from 'node:fs/promises';
import {HttpError,resourceResponse,scope,type ResourceContext} from '../../../../../../../../../../../lib/resource-http';
import {frameFile,getKeyframe} from '../../../../../../../../../../../lib/video-store';
export const runtime='nodejs';
export async function GET(request:Request,context:ResourceContext){return resourceResponse(request,async()=>{
 const {projectId,sceneId,videoId,keyframeId}=await scope(context);
 await getKeyframe(projectId,sceneId,videoId,keyframeId);
 const size=new URL(request.url).searchParams.get('size');
 if(size!==null&&size!=='thumb')throw new HttpError(400,'Invalid size.');
 let bytes:Buffer;try{bytes=await readFile(frameFile(projectId,sceneId,videoId,keyframeId,size==='thumb'));}catch{throw new HttpError(404,'Resource not found.');}
 return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'image/jpeg','Content-Length':String(bytes.length),'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}});
});}
