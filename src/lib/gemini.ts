export const DEFAULT_GEMINI_MODEL='gemini-3.6-flash';
export type GeminiFailure = {code:string;message:string;status:number};

// Never return provider messages: they can contain credentials or submitted data.
export function classifyGeminiFailure(failure:unknown,context:{timedOut?:boolean;invalidOutput?:boolean}={}):GeminiFailure {
  const provider=failure && typeof failure==='object' ? failure as {status?:unknown;message?:unknown;name?:unknown} : {};
  if(context.timedOut || provider.status===408 || provider.status===504 || provider.name==='TimeoutError' || provider.name==='AbortError')return {code:'GEMINI_TIMEOUT',status:504,message:'Gemini analysis timed out or was cancelled. No findings were accepted. The request may still incur costs; obtain approval before retrying.'};
  if(context.invalidOutput)return {code:'GEMINI_OUTPUT',status:502,message:'Gemini returned empty or invalid structured findings. No findings were accepted. The request may incur costs; obtain approval before retrying.'};
  let invalidKey=false;
  if(provider.status===400 && typeof provider.message==='string'){
    try{
      const body=JSON.parse(provider.message);
      invalidKey=Array.isArray(body?.error?.details) && body.error.details.some((detail:{reason?:unknown}|null)=>detail?.reason==='API_KEY_INVALID');
    }catch{/* Unstructured provider messages stay private and unclassified. */}
  }
  if(provider.status===401 || provider.status===403 || invalidKey)return {code:'GEMINI_AUTH',status:503,message:'Gemini rejected server credentials or access. Owner: check GEMINI_API_KEY, API restrictions and project permissions; restart Next.js after changes.'};
  if(provider.status===404)return {code:'GEMINI_MODEL',status:503,message:'Configured Gemini model was not found or is unavailable to this key. Owner: verify GEMINI_MODEL with the authenticated models list and restart Next.js.'};
  if(provider.status===429)return {code:'GEMINI_QUOTA',status:429,message:'Gemini quota or rate limit reached. Owner: check project quota and billing before retrying. Do not enable billing without approval.'};
  if(provider.status===400)return {code:'GEMINI_REQUEST',status:502,message:'Gemini rejected the analysis request. Owner: check model compatibility and structured-output configuration before retrying; requests may incur costs.'};
  return {code:'GEMINI_FAILED',status:502,message:'Gemini analysis failed or returned invalid findings. Check model access, quota and configuration before retrying; requests may incur costs.'};
}
