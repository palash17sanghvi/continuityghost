import {createHmac, timingSafeEqual} from 'node:crypto';

/** Single-owner shared workspace: every authenticated client can access every resource.
 * No tenant/user isolation. Keep BACKEND_API_TOKEN server-only; rotate it to revoke all sessions.
 * Session cookie is a bearer capability derived from the secret, never the secret itself.
 */
const COOKIE='continuityghost_session';
const failure=(error:string,status:number)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
export function backendToken():string|null {
 const token=process.env.BACKEND_API_TOKEN;
 return token && token.length>=32 ? token : null;
}
function equal(left:string,right:string):boolean {
 const a=Buffer.from(left); const b=Buffer.from(right);
 return a.length===b.length && timingSafeEqual(a,b);
}
export function validBackendToken(value:string):boolean {
 const token=backendToken(); return token!==null && equal(value,token);
}
function capability(token:string):string {
 return createHmac('sha256',token).update('continuityghost-session-v1').digest('hex');
}
export function checkMutationOrigin(request:Request):Response|null {
 if(['GET','HEAD','OPTIONS'].includes(request.method))return null;
 const origin=request.headers.get('origin');
 if((origin!==null && origin!==new URL(request.url).origin) || request.headers.get('sec-fetch-site')==='cross-site')return failure('Cross-origin mutations are not allowed.',403);
 return null;
}
export function sessionCookie(request:Request,clear=false):string {
 const token=backendToken();
 if(!clear && !token)throw new Error('Backend authentication is not configured.');
 return `${COOKIE}=${clear?'':capability(token!)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear?0:28800}${new URL(request.url).protocol==='https:'?'; Secure':''}`;
}
export function requireBackendAuth(request:Request):Response|null {
 const token=backendToken();
 if(!token)return failure('Configure server BACKEND_API_TOKEN with at least 32 characters.',503);
 const originFailure=checkMutationOrigin(request);if(originFailure)return originFailure;
 const authValue = request.headers.get('authorization');
 if(authValue?.startsWith('Bearer ') && equal(authValue.slice(7),token))return null;
 const cookies=(request.headers.get('cookie')??'').split(';').map(v=>v.trim());
 const sessions=cookies.filter(v=>v.startsWith(`${COOKIE}=`));
 if(sessions.length===1 && equal(sessions[0].slice(COOKIE.length+1),capability(token)))return null;
 return failure('Backend authentication required.',401);
}
