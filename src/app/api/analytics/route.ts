import {requireBackendAuth} from '../../../lib/backend-auth';
import {databaseEnabled,getAnalytics} from '../../../lib/database';
export const runtime='nodejs';
export async function GET(request:Request){
 const denied=requireBackendAuth(request);if(denied)return denied;
 const projectId=new URL(request.url).searchParams.get('projectId')?.trim();
 if(!projectId || projectId.length>120)return Response.json({error:'Choose a project first.'},{status:400});
 if(!databaseEnabled())return Response.json({error:'Database is not enabled. No live analytics available.'},{status:503});
 try{return Response.json(await getAnalytics(projectId),{headers:{'Cache-Control':'no-store'}});}
 catch{return Response.json({error:'Analytics query failed. Check database configuration and migrations.'},{status:503});}
}
