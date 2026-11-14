import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const resources=vi.hoisted(()=>Object.fromEntries(['createProject','listProjects','getProject','createScene','listScenes','getScene','listAnalyses','getAnalysis','listFindings','getActiveRules','getEvents'].map(name=>[name,vi.fn()])));
vi.mock('../../../lib/resources',()=>({...resources,ResourceError:class extends Error{constructor(public status:number,message:string){super(message);}}}));
import {ResourceError} from '../../../lib/resources';
import {GET as projects,POST as createProject} from './route';
import {GET as project} from './[projectId]/route';
import {GET as scenes,POST as createScene} from './[projectId]/scenes/route';
import {GET as scene} from './[projectId]/scenes/[sceneId]/route';
import {GET as analyses} from './[projectId]/scenes/[sceneId]/analyses/route';
import {GET as analysis} from './[projectId]/scenes/[sceneId]/analyses/[analysisId]/route';
import {GET as findings} from './[projectId]/scenes/[sceneId]/analyses/[analysisId]/findings/route';
import {GET as exportAnalysis} from './[projectId]/scenes/[sceneId]/analyses/[analysisId]/export/route';
import {GET as rules} from './[projectId]/scenes/[sceneId]/rules/route';
import {GET as events} from './[projectId]/events/route';
const token='test-resources-secret-0123456789abcdef';
const req=(path='',method='GET',body?:unknown,auth=true)=>new Request(`https://app.test/api/projects${path}`,{method,headers:{...(auth?{authorization:`Bearer ${token}`} : {}),'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
const params={projectId:'p',sceneId:'s',analysisId:'00000000-0000-4000-8000-000000000001'};
const ctx=(values=params)=>({params:Promise.resolve(values)});
beforeEach(()=>{vi.stubEnv('BACKEND_API_TOKEN',token);vi.resetAllMocks();Object.values(resources).forEach(fn=>fn.mockResolvedValue([]));});afterEach(()=>vi.unstubAllEnvs());
it('auth gates every resource handler before storage',async()=>{
 for(const handler of [projects,project,scenes,scene,analyses,analysis,findings,exportAnalysis,rules,events])expect((await handler(req('','GET',undefined,false),ctx())).status).toBe(401);
 for(const handler of [createProject,createScene])expect((await handler(req('','POST',{id:'p',name:'Project'},false),ctx())).status).toBe(401);
 Object.values(resources).forEach(fn=>expect(fn).not.toHaveBeenCalled());
});
it('serves scoped reads and forwards pagination exactly',async()=>{
 for(const handler of [projects,project,scenes,scene,analysis,findings,rules])expect((await handler(req(),ctx())).status).toBe(200);
 expect(resources.getAnalysis).toHaveBeenCalledWith('p','s',params.analysisId);
 expect(resources.listFindings).toHaveBeenCalledWith('p','s',params.analysisId);
 expect((await analyses(req('?limit=7&offset=2'),ctx())).status).toBe(200);expect(resources.listAnalyses).toHaveBeenCalledWith('p','s',{limit:7,offset:2});
 expect((await events(req('?sceneId=s&limit=4'),ctx())).status).toBe(200);expect(resources.getEvents).toHaveBeenCalledWith('p',{sceneId:'s',limit:4,offset:0});
});
it('creates exact IDs without path repair',async()=>{
 resources.createProject.mockResolvedValue({id:'p',name:'Project'});expect((await createProject(req('','POST',{id:'p',name:'Project'}))).status).toBe(201);expect(resources.createProject).toHaveBeenCalledWith({id:'p',name:'Project'});
 expect((await createScene(req('','POST',{id:'s',name:'Scene'}),ctx())).status).toBe(201);expect(resources.createScene).toHaveBeenCalledWith({projectId:'p',id:'s',name:'Scene'});
 for(const id of [' p','p/../x','p%2Fx','x'.repeat(121)])expect((await createProject(req('','POST',{id,name:'Project'}))).status).toBe(400);
 expect((await project(req(),ctx({...params,projectId:'../bad'}))).status).toBe(404);
});
it('rejects oversized streamed bodies and malformed requests',async()=>{
 expect((await createProject(req('','POST',{id:'p',name:'x'.repeat(5000)}))).status).toBe(413);
 for(const query of ['?limit=0','?limit=101','?offset=-1','?limit=1&limit=2','?offset=1.2'])expect((await analyses(req(query),ctx())).status).toBe(400);
 expect((await createProject(req('','POST',{id:'p',name:'x'.repeat(201)}))).status).toBe(400);
});
it('exports scoped analysis and findings as JSON attachment',async()=>{
 resources.getAnalysis.mockResolvedValue({id:params.analysisId});resources.listFindings.mockResolvedValue([{id:'finding'}]);
 const response=await exportAnalysis(req(),ctx());expect(response.headers.get('content-disposition')).toContain('attachment');expect(response.headers.get('content-type')).toContain('application/json');expect(await response.json()).toEqual({analysis:{id:params.analysisId},findings:[{id:'finding'}]});
});
it('returns safe resource status codes',async()=>{for(const status of [400,404,409,503]){resources.listProjects.mockRejectedValue(new ResourceError(status,'private-db-secret'));const response=await projects(req());expect(response.status).toBe(status);expect(await response.text()).not.toContain('private-db-secret');}});
it('blocks cross-origin resource writes before storage',async()=>{const response=await createProject(new Request('https://app.test/api/projects',{method:'POST',headers:{authorization:`Bearer ${token}`,origin:'https://evil.test','content-type':'application/json'},body:JSON.stringify({id:'p',name:'Project'})}));expect(response.status).toBe(403);expect(resources.createProject).not.toHaveBeenCalled();});
it('redacts storage failures',async()=>{resources.listProjects.mockRejectedValue(new Error('private-db-password'));const response=await projects(req());expect(response.status).toBe(503);expect(await response.text()).not.toContain('private-db-password');});
