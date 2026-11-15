import { z } from 'zod';

export const videoFindingSchema = z.object({
  id:z.string().uuid(), pairId:z.string().regex(/^pair-[a-zA-Z0-9-]+$/),
  category:z.enum(['wardrobe','props','placement','appearance','action','background']),
  description:z.string().trim().min(1).max(3000), referenceEvidence:z.string().trim().min(1).max(3000),
  candidateEvidence:z.string().trim().min(1).max(3000), uncertainty:z.string().trim().min(1).max(3000),
  suggestedAction:z.string().trim().min(1).max(3000),
  status:z.enum(['unreviewed','confirmed','dismissed','intentional']), note:z.string().max(4000).optional(),
});
const frameId=z.string().regex(/^frame-[a-zA-Z0-9-]+$/);
export const keyframeSchema=z.object({id:frameId,timeSeconds:z.number().finite().nonnegative(),shotId:z.number().int().nonnegative()});
export const framePairSchema=z.object({id:z.string().regex(/^pair-[a-zA-Z0-9-]+$/),referenceFrameId:frameId,candidateFrameId:frameId,score:z.number().finite()});
export const videoRecordSchema=z.object({
  analysisId:z.string().uuid(),projectId:z.string().trim().min(1).max(120),sceneId:z.string().trim().min(1).max(120),
  clipName:z.string().min(1).max(255),mimeType:z.enum(['video/mp4','video/webm','video/quicktime']),
  duration:z.number().finite().positive().max(60.1),createdAt:z.string().datetime(),summary:z.string().trim().min(1).max(3000),
  frames:z.array(keyframeSchema).min(2).max(40),pairs:z.array(framePairSchema).min(1).max(8),findings:z.array(videoFindingSchema).max(30),
}).superRefine((record,ctx)=>{
  const frames=new Map(record.frames.map(frame=>[frame.id,frame]));
  const pairs=new Set(record.pairs.map(pair=>pair.id));
  if(frames.size!==record.frames.length || pairs.size!==record.pairs.length || new Set(record.findings.map(f=>f.id)).size!==record.findings.length)ctx.addIssue({code:'custom',message:'Duplicate evidence identifiers.'});
  for(const frame of record.frames)if(frame.timeSeconds>=record.duration)ctx.addIssue({code:'custom',message:'Frame timestamp outside clip.'});
  const compared=new Set<string>();
  for(const pair of record.pairs){
    const a=frames.get(pair.referenceFrameId),b=frames.get(pair.candidateFrameId);
    const key=`${pair.referenceFrameId}:${pair.candidateFrameId}`;
    if(!a || !b || a.timeSeconds>=b.timeSeconds || compared.has(key))ctx.addIssue({code:'custom',message:'Invalid or duplicate chronological frame pair.'});
    compared.add(key);
  }
  for(const finding of record.findings)if(!pairs.has(finding.pairId))ctx.addIssue({code:'custom',message:'Finding references unknown evidence pair.'});
});
export type VideoFinding=z.infer<typeof videoFindingSchema>;
export type Keyframe=z.infer<typeof keyframeSchema>;
export type FramePair=z.infer<typeof framePairSchema>;
export type VideoRecord=z.infer<typeof videoRecordSchema>;
export type VideoPersistence={mode:'local'|'postgres';warning?:string};
export const videoAnalysisSchema=videoRecordSchema.safeExtend({
  persistence:z.object({mode:z.enum(['local','postgres']),warning:z.string().max(3000).optional()}),
  memory:z.object({status:z.string().min(1).max(100),warning:z.string().max(3000).optional(),facts:z.array(z.object({id:z.string().min(1).max(300),content:z.string().min(1).max(12000),source:z.string().min(1).max(100).optional()})).max(40).optional()}),
});
export type VideoAnalysis=z.infer<typeof videoAnalysisSchema>;
