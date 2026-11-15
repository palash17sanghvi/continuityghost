import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createVideoFixture } from '../../scripts/create-video-fixture';
const provider = vi.hoisted(()=>({ generate:vi.fn(), options:vi.fn() }));
vi.mock('@google/genai',()=>({GoogleGenAI:class {
  constructor(options:unknown){provider.options(options);}
  models={generateContent:provider.generate};
}}));
import { analyzeVideo, type VideoInput } from './video-analysis';
let root:string, input:VideoInput;
const finding={pairId:'pair-000',category:'wardrobe',description:'Offline mocked watch difference',referenceEvidence:'Watch visible',candidateEvidence:'Watch absent',uncertainty:'Mock result, not AI detection',suggestedAction:'Human review'};
beforeAll(async()=>{
 root=await mkdtemp(path.join(tmpdir(),'video-analysis-test-'));
 await createVideoFixture(path.join(root,'watch.mp4'));
 input={buffer:await readFile(path.join(root,'watch.mp4')),mimeType:'video/mp4',clipName:'watch.mp4',projectId:'test-project',sceneId:'test-scene',context:'',consent:true,costApproved:true,memoryConsent:false};
},30_000);
beforeEach(()=>{
 vi.stubEnv('ALLOW_DATABASE','false');vi.stubEnv('ALLOW_SUPERMEMORY','false');
 vi.stubEnv('ALLOW_PAID_ANALYSIS','true');vi.stubEnv('GEMINI_API_KEY','offline-provider-test');
 vi.stubEnv('CONTINUITY_DATA_DIR',path.join(root,'data'));
 provider.generate.mockReset();provider.options.mockReset();
 provider.generate.mockResolvedValue({text:JSON.stringify({summary:'Offline test result.',findings:[finding]})});
});
afterAll(async()=>{vi.unstubAllEnvs();await rm(root,{recursive:true,force:true});});
afterEach(()=>vi.unstubAllEnvs());
describe('automatic video analysis; only provider mocked',()=>{
 it('sends one labeled image batch, retains extracted timestamps and persists real media',async()=>{
  const result=await analyzeVideo(input);
  expect(provider.generate).toHaveBeenCalledTimes(1);
  expect(provider.options.mock.calls[0][0].httpOptions).toMatchObject({timeout:65_000,retryOptions:{attempts:1}});
  const request=provider.generate.mock.calls[0][0];
  const schema=JSON.stringify(request.config.responseJsonSchema);
  expect(schema).toContain('pairId');expect(schema).not.toMatch(/minLength|maxLength|maxItems|minItems|pattern/);
  expect(request.config.abortSignal).toBeInstanceOf(AbortSignal);
  expect(request.contents[0].text).toContain('untrusted production data');
  expect(request.contents.filter((p:{inlineData?:unknown})=>p.inlineData).length).toBeLessThanOrEqual(8);
  expect(result.findings[0]).toMatchObject({pairId:'pair-000',status:'unreviewed'});
  expect(result.summary).toContain('Automatic heuristic sampling');
  expect(result.summary).toContain('not exact mistake onset');
  expect(result.persistence.mode).toBe('local');
  // Storage layout is private: verify source evidence exists recursively.
  const walk=async(dir:string):Promise<string[]>=>{
   const entries=await readdir(dir,{withFileTypes:true});
   return (await Promise.all(entries.map(e=>e.isDirectory()?walk(path.join(dir,e.name)):Promise.resolve([path.join(dir,e.name)])))).flat();
  };
  const files=await walk(path.join(root,'data'));
  expect(files.some(file=>path.basename(file)==='clip')).toBe(true);
  expect(files.some(file=>path.basename(file)==='frame-000.jpg')).toBe(true);
 },30_000);
 it.each([undefined,false])('blocks missing cost consent before media or provider work (%s)',async(value)=>{
  await expect(analyzeVideo({...input,buffer:Buffer.from('invalid'),costApproved:value as boolean})).rejects.toMatchObject({code:'CONSENT_REQUIRED'});
  expect(provider.generate).not.toHaveBeenCalled();
 });
 it('blocks disabled paid configuration',async()=>{
  vi.stubEnv('ALLOW_PAID_ANALYSIS','false');
  await expect(analyzeVideo(input)).rejects.toMatchObject({code:'ANALYSIS_DISABLED'});
  expect(provider.generate).not.toHaveBeenCalled();
 });
 it.each(['unknown pair','invalid JSON','too many findings','missing evidence'])('rejects invalid provider output without retries: %s',async(kind)=>{
  const result=kind==='invalid JSON'?'not JSON':JSON.stringify({summary:'Offline invalid fixture',findings:kind==='too many findings'?Array(31).fill(finding):[{...finding,...(kind==='unknown pair'?{pairId:'pair-999'}:{candidateEvidence:''})}]});
  provider.generate.mockResolvedValue({text:result});
  await expect(analyzeVideo(input)).rejects.toMatchObject({code:'GEMINI_OUTPUT',status:502});
  expect(provider.generate).toHaveBeenCalledTimes(1);
 },30_000);
 it('classifies provider failures without leaking response bodies or retrying',async()=>{
  provider.generate.mockRejectedValue({status:429,message:'PRIVATE provider body'});
  await expect(analyzeVideo(input)).rejects.toMatchObject({code:'GEMINI_QUOTA',status:429});
  expect(provider.generate).toHaveBeenCalledTimes(1);
 },30_000);
});
