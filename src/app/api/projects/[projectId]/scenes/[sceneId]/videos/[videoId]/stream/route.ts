import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {HttpError,resourceResponse,scope,type ResourceContext} from '../../../../../../../../../lib/resource-http';
import {getVideo,videoFile} from '../../../../../../../../../lib/video-store';
export const runtime='nodejs';
/** Serves the stored MP4 with single-range support so <video> can seek. */
export async function GET(request:Request,context:ResourceContext){return resourceResponse(request,async()=>{
 const {projectId,sceneId,videoId}=await scope(context);
 await getVideo(projectId,sceneId,videoId);
 const path=videoFile(projectId,sceneId,videoId);
 let size:number;try{size=(await stat(path)).size;}catch{throw new HttpError(404,'Resource not found.');}
 const headers:Record<string,string>={'Content-Type':'video/mp4','Accept-Ranges':'bytes','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
 const range=request.headers.get('range');
 let start=0,end=size-1,status=200;
 if(range){
  const match=/^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if(!match||(match[1]===''&&match[2]===''))return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${size}`}});
  if(match[1]===''){const suffix=Number(match[2]);start=Math.max(0,size-suffix);}else{start=Number(match[1]);if(match[2]!=='')end=Math.min(Number(match[2]),size-1);}
  if(!Number.isSafeInteger(start)||start>end||start>=size)return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${size}`}});
  status=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`;
 }
 headers['Content-Length']=String(end-start+1);
 // Manual bridge: a client disconnect must destroy the file stream without enqueueing into a closed controller.
 const file=createReadStream(path,{start,end});let closed=false;
 const body=new ReadableStream<Uint8Array>({
  start(controller){
   file.on('data',chunk=>{if(closed)return;controller.enqueue(new Uint8Array(chunk as Buffer));if(controller.desiredSize!==null&&controller.desiredSize<=0)file.pause();});
   file.on('end',()=>{if(!closed){closed=true;controller.close();}});
   file.on('error',error=>{if(!closed){closed=true;controller.error(error);}});
  },
  pull(){file.resume();},
  cancel(){closed=true;file.destroy();},
 });
 return new Response(body,{status,headers});
});}
