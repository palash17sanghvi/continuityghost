// Next may normalize request.url's hostname to localhost. Host preserves the
// browser-facing authority; forwarded headers are not trusted by this local app.
export function isSameOriginRequest(request:Request):boolean {
  const origin=request.headers.get('origin');
  if(!origin)return true; // Preserve non-browser/local API clients.
  try{
    const url=new URL(request.url);
    if(url.protocol!=='http:' && url.protocol!=='https:')return false;
    const host=request.headers.get('host');
    if(host!==null && !/^(?:\[[0-9a-fA-F:]+\]|[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?)(?::[0-9]{1,5})?$/.test(host))return false;
    const expected=new URL(`${url.protocol}//${host ?? url.host}`);
    return origin===expected.origin;
  }catch{return false;}
}
