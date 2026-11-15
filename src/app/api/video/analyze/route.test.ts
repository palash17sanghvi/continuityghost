import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const provider=vi.hoisted(()=>({generate:vi.fn()}));
vi.mock('@google/genai',()=>({GoogleGenAI:class{models={generateContent:provider.generate};}}));
import { POST } from './route';
function request(overrides:Record<string,string|undefined>={},options:{origin?:string;mime?:string;duplicate?:boolean;length?:string}={}){
 const form=new FormData();
 for(const [key,value] of Object.entries({projectId:'Project',sceneId:'Scene',context:'',consent:'true',costApproved:'true',...overrides}))if(value!==undefined)form.set(key,value);
 form.set('video',new File(['invalid media'], 'clip.mp4',{type:options.mime??'video/mp4'}));
 if(options.duplicate)form.append('video',new File(['x'],'extra.mp4',{type:'video/mp4'}));
 return new Request('http://localhost/api/video/analyze',{method:'POST',headers:{origin:options.origin??'http://localhost',...(options.length?{'content-length':options.length}:{})},body:form});
}
beforeEach(()=>{
 vi.stubEnv('ALLOW_PAID_ANALYSIS','true');vi.stubEnv('GEMINI_API_KEY','offline-route-test');
 vi.stubEnv('ALLOW_DATABASE','false');vi.stubEnv('ALLOW_SUPERMEMORY','false');provider.generate.mockReset();
});
afterEach(()=>vi.unstubAllEnvs());
describe('video upload trust boundary',()=>{
 it('blocks foreign origins before processing',async()=>{
  expect((await POST(request({}, {origin:'https://foreign.example'}))).status).toBe(403);expect(provider.generate).not.toHaveBeenCalled();
 });
 it('blocks disabled paid work before upload processing',async()=>{
  vi.stubEnv('ALLOW_PAID_ANALYSIS','false');
  expect((await POST(request())).status).toBe(503);expect(provider.generate).not.toHaveBeenCalled();
 });
 it('rejects cross-site browser requests even without an Origin header',async()=>{
  const incoming=request();incoming.headers.delete('origin');incoming.headers.set('sec-fetch-site','cross-site');
  expect((await POST(incoming)).status).toBe(403);expect(provider.generate).not.toHaveBeenCalled();
 });
 it.each([{consent:'false'},{costApproved:'false'},{projectId:' '},{memoryConsent:'yes'}])('validates explicit metadata before extraction: %j',async(fields)=>{
  expect((await POST(request(fields))).status).toBe(400);expect(provider.generate).not.toHaveBeenCalled();
 });
 it('rejects claimed excessive bodies before buffering',async()=>{
  expect((await POST(request({}, {length:'999999999'}))).status).toBe(413);expect(provider.generate).not.toHaveBeenCalled();
 });
 it('rejects duplicate files and unsupported mime types',async()=>{
  expect((await POST(request({}, {duplicate:true}))).status).toBe(400);
  expect((await POST(request({}, {mime:'text/plain'}))).status).toBe(400);expect(provider.generate).not.toHaveBeenCalled();
 });
 it('returns safe invalid-media errors without calling provider',async()=>{
  const response=await POST(request());expect(response.status).toBe(422);
  expect(await response.json()).toEqual({code:'INVALID_VIDEO',error:'Video could not be decoded. Upload a valid MP4, WebM, or MOV clip.'});
  expect(provider.generate).not.toHaveBeenCalled();
 });
});
