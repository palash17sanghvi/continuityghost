import {databaseEnabled,persistAnalysis,persistReview,reconcileMemories} from './database';
import {memoryEnabled,retrieveMemories,rememberDecision} from './memory';
import type {analyzeImages} from './continuity';
type Analysis=Awaited<ReturnType<typeof analyzeImages>>;
export async function loadMemory(projectId:string,sceneId:string,query:string,consent:boolean){
 if(!consent || !memoryEnabled())return {status:'disabled' as const,facts:[]};
 if(!databaseEnabled())return {status:'unavailable' as const,facts:[],warning:'Database unavailable; historical decisions cannot be verified. Analysis will not use memory.'};
 try{const result=await retrieveMemories({projectId,sceneId,query});if(result.status!=='ready')return result;return {...result,facts:await reconcileMemories(projectId,sceneId,result.facts)};}
 catch{return {status:'unavailable' as const,facts:[],warning:'Memory retrieval failed. Analysis will not use historical decisions.'};}
}
export async function saveAnalysis(result:Analysis,startedAt:Date){
 if(!databaseEnabled())return {status:'disabled' as const};
 try{await persistAnalysis(result,startedAt);return {status:'saved' as const};}
 catch{return {status:'failed' as const,warning:'Analysis succeeded but database save failed. Reviews remain local; export this report before closing.'};}
}
export async function saveReview(input:{analysisId:string;findingId:string;projectId:string;sceneId:string;status:'confirmed'|'dismissed'|'intentional';note:string;consent:boolean}){
 if(!databaseEnabled())throw new Error('Database persistence is not enabled. Decision remains local.');
 const result=await persistReview(input);
 if(!input.consent || !memoryEnabled())return {persisted:true as const,decisionId:result.decisionId,memory:{status:'disabled' as const}};
 try{return {persisted:true as const,decisionId:result.decisionId,memory:await rememberDecision({projectId:input.projectId,sceneId:input.sceneId,id:input.findingId,decisionId:result.decisionId,content:result.content})};}
 catch{return {persisted:true as const,decisionId:result.decisionId,memory:{status:'unavailable' as const,warning:'Review saved in database, but Supermemory ingestion failed. This decision is not yet available through Supermemory.'}};}
}
