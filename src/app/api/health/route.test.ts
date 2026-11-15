import {afterEach,describe,expect,it,vi} from 'vitest';
import {GET} from './route';

afterEach(()=>vi.unstubAllEnvs());
describe('configuration-only health',()=>{
  it('reports model and explicit gates without exposing credentials',async()=>{
    vi.stubEnv('GEMINI_API_KEY','health-fixture-secret');
    vi.stubEnv('GEMINI_MODEL','gemini-3.8-flash');
    vi.stubEnv('ALLOW_PAID_ANALYSIS','false');
    vi.stubEnv('ALLOW_SUPERMEMORY','false');
    vi.stubEnv('ALLOW_DATABASE','false');
    const response=GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body=await response.json();
    expect(body).toEqual({geminiConfigured:true,model:'gemini-3.8-flash',paidAnalysisEnabled:false,memoryConfigured:false,databaseConfigured:false});
    expect(JSON.stringify(body)).not.toContain('health-fixture-secret');
  });
  it('uses the server default while reporting a missing key',async()=>{
    vi.stubEnv('GEMINI_API_KEY','');vi.stubEnv('GEMINI_MODEL','');vi.stubEnv('ALLOW_PAID_ANALYSIS','true');
    expect(await GET().json()).toMatchObject({geminiConfigured:false,model:'gemini-3.6-flash',paidAnalysisEnabled:true});
  });
});
