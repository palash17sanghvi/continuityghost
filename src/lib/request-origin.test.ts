import {describe,expect,it} from 'vitest';
import {isSameOriginRequest} from './request-origin';

const request=(origin:string|undefined,host?:string,extra:Record<string,string>={})=>new Request('http://localhost:3000/api/analyze',{headers:{...(origin===undefined?{}:{origin}),...(host===undefined?{}:{host}),...extra}});
describe('browser-facing request origin',()=>{
  it('uses original Host rather than Next-normalized URL',()=>{
    expect(isSameOriginRequest(request('http://127.0.0.1:3000','127.0.0.1:3000'))).toBe(true);
    expect(isSameOriginRequest(request('http://localhost:3000','127.0.0.1:3000'))).toBe(false);
  });
  it('preserves local clients without Origin and URL fallback without Host',()=>{
    expect(isSameOriginRequest(request(undefined))).toBe(true);
    expect(isSameOriginRequest(request('http://localhost:3000'))).toBe(true);
  });
  it('supports IPv6 loopback authorities',()=>{
    expect(isSameOriginRequest(request('http://[::1]:3000','[::1]:3000'))).toBe(true);
  });
  it.each(['','evil.test@localhost:3000','localhost:3000/path','localhost:3000?query','localhost:3000#hash','localhost:3000,evil.test','localhost:99999','[invalid]:3000','localhost:3000\\evil.test'])('rejects malformed Host %j',host=>{
    expect(isSameOriginRequest(request('http://localhost:3000',host))).toBe(false);
  });
  it.each(['null','https://localhost:3000','http://localhost:3001','http://other.test','http://localhost:3000/path'])('rejects mismatched or malformed Origin %j',origin=>{
    expect(isSameOriginRequest(request(origin,'localhost:3000'))).toBe(false);
  });
  it('ignores spoofed forwarded authority and protocol',()=>{
    expect(isSameOriginRequest(request('https://evil.test','localhost:3000',{'x-forwarded-host':'evil.test','x-forwarded-proto':'https',forwarded:'host=evil.test;proto=https'}))).toBe(false);
  });
});
