import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
const boundary=vi.hoisted(()=>({generate:vi.fn()}));
vi.mock('@google/genai',()=>({GoogleGenAI:class{models={generateContent:boundary.generate};}}));
import {POST as analyze} from '../app/api/video/analyze/route';
import {POST as review} from '../app/api/video/reviews/route';
import {GET as reopen} from '../app/api/video/[analysisId]/route';
import {GET as media} from '../app/api/video/[analysisId]/media/route';
import {loadVideoRules} from './video-store';
import {runMediaTool} from './video-extraction';
import {videoAnalysisSchema} from './video-contract';
let root:string;let bytes:Buffer;
beforeAll(async()=>{
 root=await mkdtemp(path.join(tmpdir(),'cg-offline-workflow-'));
 vi.stubEnv('CONTINUITY_DATA_DIR',path.join(root,'data'));vi.stubEnv('ALLOW_DATABASE','false');vi.stubEnv('ALLOW_SUPERMEMORY','false');vi.stubEnv('ALLOW_PAID_ANALYSIS','true');vi.stubEnv('GEMINI_API_KEY','offline-sdk-fixture-only');
 for(const [name,watch] of [['before',true],['after',false]] as const){
  const svg=`<svg width="256" height="192" xmlns="http://www.w3.org/2000/svg"><rect width="256" height="192" fill="#39424d"/><rect x="40" y="100" width="160" height="30" fill="#d69c79"/>${watch?'<rect x="80" y="95" width="16" height="40" fill="#eee"/>':''}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(root,`${name}.png`));
 }
 await runMediaTool('ffmpeg',['-hide_banner','-loglevel','error','-y','-loop','1','-i',path.join(root,'before.png'),'-loop','1','-i',path.join(root,'after.png'),'-filter_complex','[0:v]trim=duration=7.5,setpts=PTS-STARTPTS[a];[1:v]trim=duration=7.5,setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1:a=0[v]','-map','[v]','-r','10','-c:v','libx264','-pix_fmt','yuv420p',path.join(root,'test.mp4')]);
 bytes=await readFile(path.join(root,'test.mp4'));
 boundary.generate.mockResolvedValue({text:JSON.stringify({summary:'OFFLINE MOCK: extraction and storage integration, not genuine AI detection.',findings:[{pairId:'pair-000',category:'wardrobe',description:'OFFLINE MOCK watch change',referenceEvidence:'Fixture watch rectangle visible',candidateEvidence:'Fixture watch rectangle absent',uncertainty:'Intercepted provider result; not live AI.',suggestedAction:'Test review persistence'}]})});
},30000);
afterAll(async()=>{vi.unstubAllEnvs();await rm(root,{recursive:true,force:true});});
describe('real video route/extraction/local disk/review workflow, ONLY provider mocked',()=>{
 it('one upload automatically chooses evidence, persists decision and reloads supporting media',async()=>{
  const form=new FormData();
  for(const [k,v]of Object.entries({projectId:'offline-film',sceneId:'offline-scene',context:'Offline integration fixture',consent:'true',costApproved:'true',memoryConsent:'false'}))form.set(k,v);
  form.set('video',new File([new Uint8Array(bytes)],'offline-watch.mp4',{type:'video/mp4'}));
  const response=await analyze(new Request('http://localhost/api/video/analyze',{method:'POST',headers:{origin:'http://localhost',host:'localhost'},body:form}));
  const body=await response.json();expect(body,response.status.toString()).not.toHaveProperty('error');expect(response.status).toBe(200);
  const result=videoAnalysisSchema.parse(body);expect(result.persistence.mode).toBe('local');expect(boundary.generate).toHaveBeenCalledTimes(1);
  const pair=result.pairs.find(p=>p.id===result.findings[0].pairId)!;
  const a=result.frames.find(f=>f.id===pair.referenceFrameId)!;const b=result.frames.find(f=>f.id===pair.candidateFrameId)!;
  expect(a.timeSeconds).toBeLessThan(7.6);expect(b.timeSeconds).toBeGreaterThanOrEqual(7.6);
  const r=await review(new Request('http://localhost/api/video/reviews',{method:'POST',headers:{origin:'http://localhost',host:'localhost','content-type':'application/json'},body:JSON.stringify({analysisId:result.analysisId,findingId:result.findings[0].id,projectId:result.projectId,sceneId:result.sceneId,status:'intentional',note:'Offline reviewed exception',consent:false})}));
  expect(r.status).toBe(200);expect(await r.json()).toMatchObject({persisted:true,persistence:{mode:'local'}});
  const context={params:Promise.resolve({analysisId:result.analysisId})};
  const loaded=await reopen(new Request(`http://localhost/api/video/${result.analysisId}`),context);
  expect(await loaded.json()).toMatchObject({findings:[{status:'intentional',note:'Offline reviewed exception'}]});
  const frame=await media(new Request(`http://localhost/api/video/${result.analysisId}/media?frameId=${a.id}`),context);
  expect(frame.status).toBe(200);expect(frame.headers.get('content-type')).toBe('image/jpeg');expect((await frame.arrayBuffer()).byteLength).toBeGreaterThan(100);
  const clip=await media(new Request(`http://localhost/api/video/${result.analysisId}/media`,{headers:{range:'bytes=0-15'}}),context);
  expect(clip.status).toBe(206);expect((await clip.arrayBuffer()).byteLength).toBe(16);
  expect((await loadVideoRules(result.projectId,result.sceneId,'watch',false)).facts).toHaveLength(1);
  expect(boundary.generate).toHaveBeenCalledTimes(1);
 },30000);
});
