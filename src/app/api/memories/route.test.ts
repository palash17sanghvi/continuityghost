import {describe,it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({auth:vi.fn(),memory:vi.fn()}));
vi.mock('../../../lib/backend-auth',()=>({requireBackendAuth:mocks.auth}));
vi.mock('../../../lib/workflow',()=>({loadMemory:mocks.memory}));
import {POST} from './route';
beforeEach(()=>vi.resetAllMocks());
const request=(data:unknown)=>new Request('http://localhost/api/memories',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
describe('explicit scoped memory API',()=>{
 it('denies unauthenticated access before provider calls',async()=>{mocks.auth.mockReturnValue(Response.json({error:'Authentication required'},{status:401}));expect((await POST(request({}))).status).toBe(401);expect(mocks.memory).not.toHaveBeenCalled();});
 it('validates scope',async()=>{expect((await POST(request({projectId:'p',query:'watch'}))).status).toBe(400);expect(mocks.memory).not.toHaveBeenCalled();});
 it('returns reconciled provenance without inventing facts',async()=>{mocks.memory.mockResolvedValue({status:'ready',facts:[]});const response=await POST(request({projectId:'p',sceneId:'s',query:'watch',consent:true}));expect(await response.json()).toEqual({status:'ready',facts:[]});expect(mocks.memory).toHaveBeenCalledWith('p','s','watch',true);});
});
