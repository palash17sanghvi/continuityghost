// Actual route handlers + actual local PostgreSQL; only external AI HTTP is mocked.
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import sharp from 'sharp';
const boundary=vi.hoisted(()=>({query:vi.fn(),generate:vi.fn()}));
vi.mock('pg',()=>({Pool:class{async connect(){return {query:boundary.query,release(){}};}async end(){}}}));
vi.mock('@google/genai',()=>({GoogleGenAI:class{models={generateContent:boundary.generate}}}));
import {POST as projectPost} from '../app/api/projects/route';
import {POST as scenePost} from '../app/api/projects/[projectId]/scenes/route';
import {POST as analyze} from '../app/api/analyze/route';
import {POST as review} from '../app/api/reviews/route';
import {GET as detail} from '../app/api/projects/[projectId]/scenes/[sceneId]/analyses/[analysisId]/route';
import {GET as exportJson} from '../app/api/projects/[projectId]/scenes/[sceneId]/analyses/[analysisId]/export/route';
import {GET as analytics} from '../app/api/analytics/route';
import {storedAnalysisSchema} from './resource-contract';
const db=new PGlite();const token='offline-workflow-fixture-token-'+'x'.repeat(32);
const req=(route:string,body?:unknown)=>new Request('http://localhost'+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
const context=(params:Record<string,string>)=>({params:Promise.resolve(params)});
beforeAll(async()=>{
 vi.stubEnv('BACKEND_API_TOKEN',token);vi.stubEnv('ALLOW_DATABASE','true');vi.stubEnv('DATABASE_URL','postgres://localhost/offline-only');vi.stubEnv('GEMINI_API_KEY','offline-fixture');vi.stubEnv('ALLOW_PAID_ANALYSIS','true');vi.stubEnv('ALLOW_SUPERMEMORY','false');
 boundary.query.mockImplementation((sql:string,params?:unknown[])=>db.query(sql,params));
 for(const name of (await readdir(new URL('../../migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL('../../migrations/'+name,import.meta.url),'utf8'));
},30000);
afterAll(async()=>{await db.close();vi.unstubAllEnvs();});
describe('authenticated backend workflow with real disposable SQL',()=>{
 it('creates scope, compares, reviews idempotently, reverses, reloads and exports',async()=>{
 expect((await projectPost(req('/api/projects',{id:'film-a',name:'Original Restaurant'}))).status).toBe(201);
 expect((await scenePost(req('/api/projects/film-a/scenes',{id:'scene-14',name:'Restaurant'}),context({projectId:'film-a'}))).status).toBe(201);
 const bytes=await sharp({create:{width:8,height:8,channels:3,background:'#ccc'}}).png().toBuffer();const form=new FormData();
 for(const [k,v] of Object.entries({projectId:'film-a',sceneId:'scene-14',context:'Original test',consent:'true',costApproved:'true',memoryConsent:'false'}))form.set(k,v);
 for(const field of ['reference','candidate'])form.set(field,new File([bytes],field+'.png',{type:'image/png'}));
 boundary.generate.mockResolvedValueOnce({text:JSON.stringify({summary:'MOCKED external AI: watch difference',findings:[{category:'props',description:'Watch missing',referenceEvidence:'Band visible',candidateEvidence:'Bare wrist',uncertainty:'May be scripted',suggestedAction:'Review',severity:'medium',confidence:{level:'tentative',basis:'Action unknown'}}]})});
 const response=await analyze(new Request('http://localhost/api/analyze',{method:'POST',headers:{Authorization:'Bearer '+token},body:form}));expect(response.status).toBe(200);const result=await response.json();expect(result.persistence.status).toBe('saved');
 const input={projectId:'film-a',sceneId:'scene-14',analysisId:result.analysisId,findingId:result.findings[0].id,status:'confirmed',note:'Reset watch',consent:false,idempotencyKey:'00000000-0000-4000-8000-000000000009'};
 const first=await review(req('/api/reviews',input));expect(first.status).toBe(200);const decision=await first.json();const replay=await review(req('/api/reviews',input));expect((await replay.json()).decisionId).toBe(decision.decisionId);
 expect((await review(req('/api/reviews',{...input,idempotencyKey:'00000000-0000-4000-8000-000000000010',status:'intentional',note:'Scripted removal'}))).status).toBe(200);
 const ctx=context({projectId:'film-a',sceneId:'scene-14',analysisId:result.analysisId});const loaded=await detail(req('/api/projects/film-a/scenes/scene-14/analyses/'+result.analysisId),ctx);const saved=storedAnalysisSchema.parse(await loaded.json());expect(saved.findings[0].status).toBe('intentional');expect(saved.decisions).toHaveLength(2);expect(saved.findings[0].severity).toBe('medium');
 const exported=await exportJson(req('/export'),ctx);expect(exported.headers.get('content-disposition')).toContain('attachment');const document=await exported.json();expect(document.analysis).toEqual(saved);expect(document.findings.items).toEqual(saved.findings);
 const counts=await analytics(req('/api/analytics?projectId=film-a'));expect((await counts.json()).totals).toEqual({analyses:1,findings:1,reviews:2});
 const wrong=await detail(req('/wrong'),context({projectId:'other-film',sceneId:'scene-14',analysisId:result.analysisId}));expect(wrong.status).toBe(404);
 });
});
