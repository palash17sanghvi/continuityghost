import {z} from 'zod';
import {analysisResponseSchema,analyticsResponseSchema,healthResponseSchema,reviewRequestSchema,reviewResponseSchema,type ComparisonInput} from './api-contract';
export class ApiError extends Error {
 constructor(message:string,public readonly status:number){super(message);this.name='ApiError';}
}
export async function request<T>(url:string,schema:z.ZodType<T>,init:RequestInit={}):Promise<T>{
 const response=await fetch(url,{...init,cache:'no-store',credentials:'same-origin'});
 let data:unknown;
 try{data=await response.json();}catch{throw new ApiError(`Server returned ${response.status} without valid JSON`,response.status);}
 if(!response.ok){const error=z.object({error:z.string().max(4000)}).safeParse(data);throw new ApiError(error.success?error.data.error:`Server returned ${response.status}`,response.status);}
 const parsed=schema.safeParse(data);
 if(!parsed.success)throw new ApiError('Invalid API response',response.status);
 return parsed.data;
}
export function getHealth(signal?:AbortSignal){return request('/api/health',healthResponseSchema,{signal});}
export function getAnalytics(projectId:string,signal?:AbortSignal){
 const id=z.string().trim().min(1).max(120).parse(projectId);
 return request('/api/analytics?projectId='+encodeURIComponent(id),analyticsResponseSchema,{signal});
}
export async function saveReview(input:z.input<typeof reviewRequestSchema>,signal?:AbortSignal){
 const parsed=reviewRequestSchema.parse(input);
 return request('/api/reviews',reviewResponseSchema,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(parsed),signal});
}
export async function analyzeComparison(input:ComparisonInput,signal?:AbortSignal){
 const fields=z.object({projectId:z.string().trim().min(1).max(120),sceneId:z.string().trim().min(1).max(120),context:z.string().max(12000),consent:z.literal(true),costApproved:z.literal(true),memoryConsent:z.boolean()}).parse(input);
 for(const file of [input.reference,input.candidate]){
 if(!(file instanceof File)||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size===0||file.size>8*1024*1024)throw new Error('Use nonempty JPEG, PNG or WebP images up to 8 MiB.');
 }
 const body=new FormData();for(const [key,value] of Object.entries(fields))body.set(key,String(value));
 body.set('reference',input.reference);body.set('candidate',input.candidate);
 return request('/api/analyze',analysisResponseSchema,{method:'POST',body,signal});
}
