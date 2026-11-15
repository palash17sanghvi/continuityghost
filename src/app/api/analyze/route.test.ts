import { afterEach, describe, expect, it, vi } from 'vitest';
const { generateContent,configureClient } = vi.hoisted(()=>({generateContent:vi.fn(),configureClient:vi.fn()}));
vi.mock('@google/genai',()=>({GoogleGenAI:class {constructor(options:unknown){configureClient(options);}models={generateContent}}}));
import sharp from 'sharp';
import { POST } from './route';
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();vi.restoreAllMocks();});

async function validRequest(){
 vi.stubEnv('GEMINI_API_KEY','unit-test-only');vi.stubEnv('ALLOW_PAID_ANALYSIS','true');
 const bytes=await sharp({create:{width:8,height:8,channels:3,background:'#ddd'}}).png().toBuffer();
 const f=new FormData();
 for(const [k,v] of Object.entries({projectId:'film-a',sceneId:'scene-14',context:'Watch may be removed',consent:'true',costApproved:'true'})) f.set(k,v);
 f.set('reference',new File([bytes],'reference.png',{type:'image/png'}));f.set('candidate',new File([bytes],'candidate.png',{type:'image/png'}));
 return request(f);
}
describe('HTTP workflow with mocked Google boundary',()=>{
 it('returns validated provider results scoped to scene',async()=>{
  generateContent.mockResolvedValueOnce({text:JSON.stringify({summary:'No supported differences',findings:[]})});
  const response=await POST(await validRequest());expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({projectId:'film-a',sceneId:'scene-14',findings:[]});
  const call=generateContent.mock.calls.at(-1)?.[0];expect(call.config.responseMimeType).toBe('application/json');expect(call.contents[0].parts[2].inlineData.mimeType).toBe('image/jpeg');
  expect(call.config.responseJsonSchema).toMatchObject({type:'object',required:['summary','findings'],properties:{findings:{type:'array'}}});
  for(const keyword of ['maxItems','minLength','maxLength'])expect(JSON.stringify(call.config.responseJsonSchema)).not.toContain(keyword);
  expect(call.config.responseSchema).toBeUndefined();
  expect(call.config.temperature).toBeUndefined();expect(call.config.topP).toBeUndefined();expect(call.config.topK).toBeUndefined();
  expect(configureClient).toHaveBeenCalledWith(expect.objectContaining({httpOptions:{timeout:65_000,retryOptions:{attempts:1}}}));
 });
 it('uses the configured model without silently substituting one',async()=>{
  vi.stubEnv('GEMINI_MODEL','gemini-3.8-flash');
  generateContent.mockResolvedValueOnce({text:JSON.stringify({summary:'No supported differences',findings:[]})});
  expect((await POST(await validRequest())).status).toBe(200);
  expect(generateContent.mock.calls.at(-1)?.[0].model).toBe('gemini-3.8-flash');
 });
 it.each([
  [401,'GEMINI_AUTH',503],
  [403,'GEMINI_AUTH',503],
  [404,'GEMINI_MODEL',503],
  [429,'GEMINI_QUOTA',429],
  [500,'GEMINI_FAILED',502],
  [400,'GEMINI_REQUEST',502],
  [408,'GEMINI_TIMEOUT',504],
  [504,'GEMINI_TIMEOUT',504],
 ] as const)('classifies upstream %s without exposing provider payloads',async(status,code,httpStatus)=>{
  generateContent.mockRejectedValueOnce(Object.assign(new Error('private provider data and fixture-secret-9842'),{status}));
  const response=await POST(await validRequest());
  expect(response.status).toBe(httpStatus);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  const body=await response.json();expect(body.code).toBe(code);expect(body.error).not.toContain('private provider data');expect(body.error).not.toContain('fixture-secret-9842');
  expect(generateContent).toHaveBeenCalledTimes(1);
 });
 it('classifies the SDK JSON invalid-key error without leaking its message',async()=>{
  generateContent.mockRejectedValueOnce(Object.assign(new Error(JSON.stringify({error:{message:'private invalid key',details:[{'@type':'type.googleapis.com/google.rpc.ErrorInfo',reason:'API_KEY_INVALID'}]}})),{status:400}));
  const response=await POST(await validRequest());expect(response.status).toBe(503);
  const body=await response.json();expect(body.code).toBe('GEMINI_AUTH');expect(body.error).not.toContain('private invalid key');
 });
 it('returns safe diagnostics for malformed provider payload',async()=>{
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  generateContent.mockResolvedValueOnce({text:'private malformed data'});const response=await POST(await validRequest());expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({code:'GEMINI_OUTPUT'});
  expect(warn).toHaveBeenCalledWith('Gemini analysis failure',{code:'GEMINI_OUTPUT',phase:'output',elapsedMs:expect.any(Number)});
  expect(JSON.stringify(warn.mock.calls)).not.toContain('private malformed data');
 });
 it('classifies SDK aborts as timeouts without exposing exceptions',async()=>{
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  generateContent.mockRejectedValueOnce(new DOMException('private timeout payload','AbortError'));
  const response=await POST(await validRequest());expect(response.status).toBe(504);expect(await response.json()).toMatchObject({code:'GEMINI_TIMEOUT'});
  expect(JSON.stringify(warn.mock.calls)).not.toContain('private timeout payload');
 });
});
const request=(form?:FormData,headers:Record<string,string>={})=>new Request('http://localhost:3000/api/analyze',{method:'POST',body:form,headers:{host:'localhost:3000',...headers}});
describe('analysis request gates',()=>{
 it('accepts browser-facing loopback Host despite Next-normalized URL without bypassing validation',async()=>{
  vi.stubEnv('GEMINI_API_KEY','test');vi.stubEnv('ALLOW_PAID_ANALYSIS','true');
  expect((await POST(request(undefined,{origin:'http://127.0.0.1:3000',host:'127.0.0.1:3000'}))).status).toBe(400);
  expect(generateContent).not.toHaveBeenCalled();
 });
 it('does not treat localhost and 127.0.0.1 as interchangeable origins',async()=>{
  expect((await POST(request(undefined,{origin:'http://localhost:3000',host:'127.0.0.1:3000'}))).status).toBe(403);
  expect(generateContent).not.toHaveBeenCalled();
 });
 it('bounds streamed requests without Content-Length',async()=>{vi.stubEnv('GEMINI_API_KEY','test');vi.stubEnv('ALLOW_PAID_ANALYSIS','true');const req=new Request('http://localhost:3000/api/analyze',{method:'POST',body:new Uint8Array(17_000_000),headers:{'content-type':'multipart/form-data; boundary=test'}});expect((await POST(req)).status).toBe(413);});
 it('rejects invalid decoded uploads before contacting Google',async()=>{vi.stubEnv('GEMINI_API_KEY','test');vi.stubEnv('ALLOW_PAID_ANALYSIS','true');const f=new FormData();for(const [k,v] of Object.entries({projectId:'a',sceneId:'b',context:'',consent:'true',costApproved:'true'}))f.set(k,v);f.set('reference',new File(['bad'],'a.png',{type:'image/png'}));f.set('candidate',new File(['bad'],'b.png',{type:'image/png'}));expect((await POST(request(f))).status).toBe(400);expect(generateContent).not.toHaveBeenCalled();});
 it('refuses cross-origin before processing',async()=>{expect((await POST(request(undefined,{origin:'https://evil.test'}))).status).toBe(403);expect(generateContent).not.toHaveBeenCalled();});
 it('refuses requests when server cost approval missing',async()=>{vi.stubEnv('GEMINI_API_KEY','test');vi.stubEnv('ALLOW_PAID_ANALYSIS','false');expect((await POST(request())).status).toBe(403);expect(generateContent).not.toHaveBeenCalled();});
 it('reports missing key without fake results',async()=>{vi.stubEnv('GEMINI_API_KEY','');expect((await POST(request())).status).toBe(503);});
 it('rejects over-limit requests before reading body',async()=>{vi.stubEnv('GEMINI_API_KEY','test');vi.stubEnv('ALLOW_PAID_ANALYSIS','true');expect((await POST(request(undefined,{'content-length':'18000000'}))).status).toBe(413);});
 it('requires explicit data and cost consent',async()=>{vi.stubEnv('GEMINI_API_KEY','test');vi.stubEnv('ALLOW_PAID_ANALYSIS','true');const f=new FormData();f.set('projectId','film');f.set('sceneId','scene');expect((await POST(request(f))).status).toBe(400);});
});
