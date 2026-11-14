// SYNTHETIC design/test fixtures only. Never use as a production API fallback.
import type {AnalysisResponse,AnalyticsResponse,HealthResponse,ReviewRequest,ReviewResponse} from './api-contract';
export const syntheticHealth:HealthResponse={geminiConfigured:false,model:'gemini-3.8-flash',paidAnalysisEnabled:false,memoryConfigured:false,databaseConfigured:false};
export const syntheticAnalysis:AnalysisResponse={
 analysisId:'00000000-0000-4000-8000-000000000001',projectId:'synthetic-restaurant',sceneId:'scene-14',summary:'SYNTHETIC FIXTURE — illustrative watch difference, not a Gemini detection.',
 findings:[{id:'00000000-0000-4000-8000-000000000002',category:'appearance',description:'SYNTHETIC: silver watch may be absent.',referenceEvidence:'Illustrated silver watch on visible wrist.',candidateEvidence:'Illustrated wrist shown without watch.',uncertainty:'A scripted removal may explain the difference.',suggestedAction:'Check intended action with supervisor.',status:'unreviewed'}],memory:{status:'disabled',facts:[]},persistence:{status:'disabled'},
};
export const syntheticReview:ReviewRequest={analysisId:syntheticAnalysis.analysisId,findingId:syntheticAnalysis.findings[0].id,projectId:syntheticAnalysis.projectId,sceneId:syntheticAnalysis.sceneId,status:'intentional',note:'SYNTHETIC: approved scripted watch removal.',consent:false};
export const syntheticSavedReview:ReviewResponse={persisted:true,decisionId:'00000000-0000-4000-8000-000000000003',memory:{status:'queued',id:'synthetic-document'}};
export const syntheticEmptyAnalysis:AnalysisResponse={...syntheticAnalysis,summary:'SYNTHETIC FIXTURE — no supported differences.',findings:[]};
export const syntheticAnalytics:AnalyticsResponse={categories:[],outcomes:[],trends:[],totals:{analyses:0,findings:0,reviews:0},timeSeriesMode:'postgres'};
export const syntheticMemoryAnalysis:AnalysisResponse={...syntheticAnalysis,memory:{status:'ready',facts:[{id:'synthetic-memory-hit',content:'SYNTHETIC: supervisor approved scripted watch removal.',source:'supermemory',decisionId:'00000000-0000-4000-8000-000000000003'}]},persistence:{status:'saved'}};
export const syntheticPersistenceFailure:AnalysisResponse={...syntheticAnalysis,persistence:{status:'failed',warning:'SYNTHETIC: database save failed; export before closing.'},memory:{status:'unavailable',facts:[],warning:'SYNTHETIC: memory unavailable; no historical context used.'}};
