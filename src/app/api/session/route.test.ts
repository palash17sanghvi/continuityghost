import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {POST,DELETE} from './route';
import {HttpError,readJsonBody} from '../../../lib/resource-http';
const token='test-session-secret-0123456789abcdef';
const req=(body:unknown,origin='https://app.test')=>new Request('https://app.test/api/session',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
beforeEach(()=>vi.stubEnv('BACKEND_API_TOKEN',token));afterEach(()=>vi.unstubAllEnvs());
it('creates derived HttpOnly cookie only for valid login',async()=>{expect((await POST(req({token:'wrong'}))).status).toBe(401);const response=await POST(req({token}));expect(response.status).toBe(200);expect(response.headers.get('set-cookie')).toContain('HttpOnly');expect(response.headers.get('set-cookie')).not.toContain(token);});
it('blocks cross-origin login/logout',async()=>{expect((await POST(req({token},'https://evil.test'))).status).toBe(403);expect((await DELETE(new Request('https://app.test/api/session',{method:'DELETE',headers:{origin:'https://evil.test'}}))).status).toBe(403);});
it('clears cookie on logout',async()=>{const response=await DELETE(new Request('https://app.test/api/session',{method:'DELETE',headers:{origin:'https://app.test'}}));expect(response.headers.get('set-cookie')).toContain('Max-Age=0');});
it('rejects malformed and oversized streamed JSON',async()=>{expect((await POST(new Request('https://app.test/api/session',{method:'POST',headers:{'content-type':'application/json'},body:'{'}))).status).toBe(400);expect((await POST(req({token:'x'.repeat(4096)}))).status).toBe(413);});
it('exposes bounded 24KB readJsonBody and counts streamed bytes without content-length',async()=>{
 const body={text:'x'.repeat(5000)};expect(await readJsonBody(req(body))).toEqual(body);
 await expect(readJsonBody(req({text:'x'.repeat(24000)}))).rejects.toMatchObject({status:413});
 const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode(JSON.stringify({token:'x'.repeat(5000)})));controller.close();}});
 const request=new Request('https://app.test/api/session',{method:'POST',headers:{'content-type':'application/json'},body:stream,duplex:'half'} as RequestInit);
 expect(request.headers.has('content-length')).toBe(false);expect((await POST(request)).status).toBe(413);
 await expect(readJsonBody(new Request('https://app.test',{method:'POST',headers:{'content-type':'application/json'},body:'{'}))).rejects.toBeInstanceOf(HttpError);
});
it('fails closed without configuration',async()=>{vi.stubEnv('BACKEND_API_TOKEN','');expect((await POST(req({token}))).status).toBe(503);});
