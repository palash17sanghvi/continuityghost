import { afterEach, describe, expect, it, vi } from 'vitest';
const { generateContent } = vi.hoisted(()=>({generateContent:vi.fn()}));
vi.mock('@google/genai',()=>({GoogleGenAI:class {models={generateContent}}}));
import sharp from 'sharp';
import { POST } from './route';
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});

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
 });
 it('returns safe error for malformed provider payload',async()=>{generateContent.mockResolvedValueOnce({text:'private malformed data'});const response=await POST(await validRequest());expect(response.status).toBe(502);expect(await response.text()).not.toContain('private malformed data');});
});
const request=(form?:FormData,headers:Record<string,string>={})=>new Request('http://localhost:3000/api/analyze',{method:'POST',body:form,headers:{host:'localhost:3000',...headers}});
describe('analysis request gates',()=>{
 it('bounds streamed requests without Content-Length',async()=>{vi.stubEnv('GEMINI_API_KEY','test');vi.stubEnv('ALLOW_PAID_ANALYSIS','true');const req=new Request('http://localhost:3000/api/analyze',{method:'POST',body:new Uint8Array(17_000_000),headers:{'content-type':'multipart/form-data; boundary=test'}});expect((await POST(req)).status).toBe(413);});
 it('rejects invalid decoded uploads before contacting Google',async()=>{vi.stubEnv('GEMINI_API_KEY','test');vi.stubEnv('ALLOW_PAID_ANALYSIS','true');const f=new FormData();for(const [k,v] of Object.entries({projectId:'a',sceneId:'b',context:'',consent:'true',costApproved:'true'}))f.set(k,v);f.set('reference',new File(['bad'],'a.png',{type:'image/png'}));f.set('candidate',new File(['bad'],'b.png',{type:'image/png'}));expect((await POST(request(f))).status).toBe(400);expect(generateContent).not.toHaveBeenCalled();});
 it('refuses cross-origin before processing',async()=>{expect((await POST(request(undefined,{origin:'https://evil.test'}))).status).toBe(403);});
 it('refuses requests when server cost approval missing',async()=>{vi.stubEnv('GEMINI_API_KEY','test');vi.stubEnv('ALLOW_PAID_ANALYSIS','false');expect((await POST(request())).status).toBe(403);});
 it('reports missing key without fake results',async()=>{vi.stubEnv('GEMINI_API_KEY','');expect((await POST(request())).status).toBe(503);});
 it('rejects over-limit requests before reading body',async()=>{vi.stubEnv('GEMINI_API_KEY','test');vi.stubEnv('ALLOW_PAID_ANALYSIS','true');expect((await POST(request(undefined,{'content-length':'18000000'}))).status).toBe(413);});
 it('requires explicit data and cost consent',async()=>{vi.stubEnv('GEMINI_API_KEY','test');vi.stubEnv('ALLOW_PAID_ANALYSIS','true');const f=new FormData();f.set('projectId','film');f.set('sceneId','scene');expect((await POST(request(f))).status).toBe(400);});
});
