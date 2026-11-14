import {getAnalysis,listFindings} from '../../../../../../../../../lib/resources';
import {resourceResponse,scope,type ResourceContext} from '../../../../../../../../../lib/resource-http';
export const runtime='nodejs';
export async function GET(request:Request,context:ResourceContext){return resourceResponse(request,async()=>{const {projectId,sceneId,analysisId}=await scope(context);const analysis=await getAnalysis(projectId,sceneId,analysisId);const findings=await listFindings(projectId,sceneId,analysisId);return Response.json({analysis,findings},{headers:{'Cache-Control':'no-store','Content-Disposition':`attachment; filename="analysis-${analysisId}.json"`}});});}
