import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createVideoFixture } from '../../scripts/create-video-fixture';
import { runMediaTool } from './video-extraction';
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
  expect(request.config.maxOutputTokens).toBe(10_000);
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

describe('evidence-first regressions (provider mocked, not detection benchmarks)',()=>{
 it('accepts a real static no-mistake clip with zero findings without inventing an issue',async()=>{
  const file=path.join(root,'unchanged.mp4');
  await runMediaTool('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=gray:s=320x180:r=10:d=15','-c:v','libx264','-threads','2','-pix_fmt','yuv420p',file]);
  provider.generate.mockResolvedValueOnce({text:JSON.stringify({summary:'No supported visible inconsistency.',findings:[]})});
  const result=await analyzeVideo({...input,buffer:await readFile(file)});
  expect(result.findings).toEqual([]);expect(provider.generate).toHaveBeenCalledTimes(1);
 });
 it('attaches two authoritative timestamps/frame references and qualitative confidence without changing public fields',async()=>{
  provider.generate.mockResolvedValueOnce({text:JSON.stringify({summary:'One supported possible issue.',findings:[{...finding,interpretation:'suspected_continuity_error',evidenceConfidence:'high'}]})});
  const result=await analyzeVideo(input);const f=result.findings[0];
  const pair=result.pairs.find(p=>p.id===f.pairId)!;
  const a=result.frames.find(frame=>frame.id===pair.referenceFrameId)!,b=result.frames.find(frame=>frame.id===pair.candidateFrameId)!;
  expect(f.referenceEvidence).toContain(`[${a.timeSeconds.toFixed(2)}s / ${a.id}]`);
  expect(f.candidateEvidence).toContain(`[${b.timeSeconds.toFixed(2)}s / ${b.id}]`);
  expect(f.description).toMatch(/^Suspected continuity error:/);expect(f.uncertainty).toContain('confidence: high');
  expect(Object.keys(f).sort()).toEqual(['id','pairId','category','description','referenceEvidence','candidateEvidence','uncertainty','suggestedAction','status'].sort());
  expect(f.status).toBe('unreviewed');
  const prompt=provider.generate.mock.calls[0][0].contents[0].text;
  expect(prompt).toContain('screen sides is NOT proof of switching hands');expect(prompt).toContain('Do not force a minimum finding count');
  expect(prompt).toContain('picking up/removing an object');expect(prompt).toContain('not a calibrated probability');
 });
 it('preserves multiple independently supported changes on the same evidence pair',async()=>{
  const prop={...finding,category:'props',description:'Cup changed',referenceEvidence:'Red cup on table',candidateEvidence:'Blue cup on table',interpretation:'observed_difference',evidenceConfidence:'moderate'};
  provider.generate.mockResolvedValueOnce({text:JSON.stringify({summary:'Two independent visible differences.',findings:[finding,prop]})});
  const result=await analyzeVideo(input);expect(result.findings).toHaveLength(2);expect(provider.generate).toHaveBeenCalledTimes(1);
  expect(result.findings[1].description).toMatch(/^Observed difference:/);
 });
 it('keeps ambiguous observations separate from errors and does not manufacture confidence',async()=>{
  provider.generate.mockResolvedValueOnce({text:JSON.stringify({summary:'Visible difference, narrative intent unresolved.',findings:[{...finding,uncertainty:'Actor may have intentionally removed the watch.',interpretation:'observed_difference',evidenceConfidence:'insufficient'}]})});
  const result=await analyzeVideo(input);expect(result.findings[0].description).toMatch(/^Observed difference:/);
  expect(result.findings[0].uncertainty).toContain('confidence: not established');expect(result.findings[0].uncertainty).toContain('intentionally removed');
 });
 it('collapses repeated evidence with case/punctuation variation but keeps unrelated evidence',async()=>{
  provider.generate.mockResolvedValueOnce({text:JSON.stringify({summary:'Repeated observation.',findings:[finding,{...finding,description:'Same change repeated',referenceEvidence:' WATCH VISIBLE! ',candidateEvidence:'watch absent.'},{...finding,description:'Separate item',referenceEvidence:'Coat collar up',candidateEvidence:'Coat collar down'}]})});
  expect((await analyzeVideo(input)).findings).toHaveLength(2);
 });
 it.each(['low','insufficient'])('does not upgrade %s evidence into a suspected error',async(evidenceConfidence)=>{
  provider.generate.mockResolvedValueOnce({text:JSON.stringify({summary:'Weak interpretation.',findings:[{...finding,interpretation:'suspected_continuity_error',evidenceConfidence}]})});
  expect((await analyzeVideo(input)).findings[0].description).toMatch(/^Observed difference:/);
 });
 it.each([
  {referenceTimeSeconds:99},{candidateTimestamp:'00:99'},{referenceFrameId:'frame-invented'},
  {evidenceConfidence:'99%'},{interpretation:'definite_error'},
 ])('rejects invented temporal/frame/confidence claims instead of silently ignoring them: %j',async(extra)=>{
  provider.generate.mockResolvedValueOnce({text:JSON.stringify({summary:'Invalid provider evidence.',findings:[{...finding,...extra}]})});
  await expect(analyzeVideo(input)).rejects.toMatchObject({code:'GEMINI_OUTPUT',status:502});expect(provider.generate).toHaveBeenCalledTimes(1);
 });
 it('treats provider 504 as a timeout with no generation retry',async()=>{
  provider.generate.mockRejectedValueOnce({status:504});
  await expect(analyzeVideo(input)).rejects.toMatchObject({code:'GEMINI_TIMEOUT',status:504});expect(provider.generate).toHaveBeenCalledTimes(1);
 });
});
