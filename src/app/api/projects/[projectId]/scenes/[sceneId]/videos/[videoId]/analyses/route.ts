import {json,readJson,resourceResponse,scope,type ResourceContext} from '../../../../../../../../../lib/resource-http';
import {startAnalysis} from '../../../../../../../../../lib/video-service';
export const runtime='nodejs';
export const maxDuration=300;
export async function POST(request:Request,context:ResourceContext){return resourceResponse(request,async()=>{
 const {projectId,sceneId,videoId}=await scope(context);
 const body=await readJson(request,1024);
 const plan=await startAnalysis(projectId,sceneId,videoId,body);
 // Fire and forget on the Node server. runAnalysis never throws; failures are recorded on the analysis.
 if(plan.run)void plan.run();
 return json({analysis:plan.analysis},202);
});}
