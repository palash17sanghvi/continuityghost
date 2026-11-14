import {describe,it,expect,vi,beforeEach} from 'vitest';
const save=vi.hoisted(()=>vi.fn());
vi.mock('../../../lib/workflow',()=>({saveReview:save}));
import {POST} from './route';
const payload={analysisId:'00000000-0000-4000-8000-000000000001',findingId:'00000000-0000-4000-8000-000000000002',projectId:'p',sceneId:'s',status:'intentional',note:'Watch removed on cue',consent:true};
const req=(value:unknown=payload,origin='http://localhost:3000')=>new Request('http://localhost:3000/api/reviews',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(value)});
beforeEach(()=>vi.resetAllMocks());
describe('review HTTP boundary',()=>{
 it('rejects cross origin without storing',async()=>{expect((await POST(req(payload,'https://other.test'))).status).toBe(403);expect(save).not.toHaveBeenCalled();});
 it('rejects invalid status and missing consent field',async()=>{expect((await POST(req({...payload,status:'approved'}))).status).toBe(400);expect((await POST(req({...payload,consent:undefined}))).status).toBe(400);});
 it('returns persisted decision with honest pending memory state',async()=>{save.mockResolvedValue({persisted:true,memory:{status:'queued'}});const response=await POST(req());expect(response.status).toBe(200);expect(await response.json()).toEqual({persisted:true,memory:{status:'queued'}});});
 it('never returns provider credentials on database failure',async()=>{save.mockRejectedValue(new Error('postgres://private:password'));const response=await POST(req());expect(response.status).toBe(503);expect(await response.text()).not.toContain('password');});
});
