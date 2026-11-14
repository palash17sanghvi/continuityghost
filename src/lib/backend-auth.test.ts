import {beforeEach, afterEach, describe, expect, it, vi} from 'vitest';
import {requireBackendAuth, sessionCookie, checkMutationOrigin} from './backend-auth';
const token='test-only-secret-0123456789abcdef0123456789';
const request=(headers:HeadersInit={},method='GET')=>new Request('https://app.test/api/projects',{headers,method});
beforeEach(()=>vi.stubEnv('BACKEND_API_TOKEN',token));
afterEach(()=>vi.unstubAllEnvs());
describe('single-owner backend auth',()=>{
 it('fails closed on absent or short configuration',()=>{for(const value of ['', 'short']){vi.stubEnv('BACKEND_API_TOKEN',value);expect(requireBackendAuth(request())?.status).toBe(503);}});
 it('requires exact bearer token',()=>{expect(requireBackendAuth(request())?.status).toBe(401);expect(requireBackendAuth(request({authorization:`Bearer ${token}x`}))?.status).toBe(401);expect(requireBackendAuth(request({authorization:`Bearer ${token}`}))).toBeNull();});
 it('accepts derived session capability, not raw token',()=>{const cookie=sessionCookie(request());expect(cookie).not.toContain(token);expect(cookie).toContain('HttpOnly');expect(cookie).toContain('SameSite=Strict');expect(cookie).toContain('Secure');expect(requireBackendAuth(request({cookie:cookie.split(';')[0]}))).toBeNull();expect(requireBackendAuth(request({cookie:`continuityghost_session=${token}`}))?.status).toBe(401);});
 it('rejects cross-origin mutations even with bearer',()=>{expect(requireBackendAuth(request({authorization:`Bearer ${token}`,origin:'https://evil.test'},'POST'))?.status).toBe(403);expect(checkMutationOrigin(request({'sec-fetch-site':'cross-site'},'DELETE'))?.status).toBe(403);expect(requireBackendAuth(request({authorization:`Bearer ${token}`,origin:'https://app.test'},'POST'))).toBeNull();});
 it('does not mark plain HTTP cookies Secure',()=>{expect(sessionCookie(new Request('http://localhost/api/session'))).not.toContain('; Secure');});
});
