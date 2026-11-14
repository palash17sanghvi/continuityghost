import {afterEach,describe,it,expect,vi} from 'vitest';
import {createProject,getAnalysis,listProjects,retrieveMemories,createSession} from './resource-client';
afterEach(()=>vi.unstubAllGlobals());
describe('resource browser adapter',()=>{
 it('validates create and list contracts',async()=>{const project={id:'film-a',name:'Restaurant',createdAt:'2026-11-14T00:00:00Z'};const f=vi.fn().mockResolvedValueOnce(Response.json(project)).mockResolvedValueOnce(Response.json({items:[project],total:1,limit:50,offset:0}));vi.stubGlobal('fetch',f);expect(await createProject({id:'film-a',name:'Restaurant'})).toEqual(project);expect((await listProjects()).total).toBe(1);});
 it('rejects invalid scope before requests',()=>{const f=vi.fn();vi.stubGlobal('fetch',f);expect(()=>getAnalysis('../p','s','a')).toThrow();expect(f).not.toHaveBeenCalled();});
 it('requires explicit memory consent',()=>{const f=vi.fn();vi.stubGlobal('fetch',f);expect(()=>retrieveMemories({projectId:'p',sceneId:'s',query:'watch',consent:false} as never)).toThrow();expect(f).not.toHaveBeenCalled();});
 it('sessions send token only in POST body, not URL',async()=>{const f=vi.fn().mockResolvedValue(Response.json({authenticated:true}));vi.stubGlobal('fetch',f);await createSession('fixture-token');expect(f.mock.calls[0][0]).toBe('/api/session');expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({token:'fixture-token'});expect(f.mock.calls[0][1].credentials).toBe('same-origin');});
});
