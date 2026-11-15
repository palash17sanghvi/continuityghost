import {describe,it,expect} from 'vitest';
import {videoRecordSchema,type VideoRecord} from './video-contract';

const record:VideoRecord={analysisId:'3a6ca81c-a5e0-42a0-a0d9-d66be0e47df3',projectId:'Film',sceneId:'Scene',clipName:'test.mp4',mimeType:'video/mp4',duration:15,createdAt:'2026-11-15T00:00:00.000Z',summary:'Test fixture only; not detected by AI.',frames:[{id:'frame-000',timeSeconds:0,shotId:0},{id:'frame-001',timeSeconds:8,shotId:1}],pairs:[{id:'pair-000',referenceFrameId:'frame-000',candidateFrameId:'frame-001',score:1}],findings:[{id:'ba14b549-0fd6-44aa-a2ad-c27960fa8431',pairId:'pair-000',category:'wardrobe',description:'Fixture finding',referenceEvidence:'Fixture A',candidateEvidence:'Fixture B',uncertainty:'Fixture uncertainty',suggestedAction:'Review',status:'unreviewed'}]};
describe('video evidence trust boundary',()=>{
 it('accepts a grounded chronological evidence graph',()=>expect(videoRecordSchema.safeParse(record).success).toBe(true));
 it.each([
  {...record,frames:[record.frames[0],record.frames[0]]},
  {...record,frames:[record.frames[0],{...record.frames[1],timeSeconds:15}]},
  {...record,pairs:[{...record.pairs[0],referenceFrameId:'frame-missing'}]},
  {...record,pairs:[{...record.pairs[0],referenceFrameId:'frame-001',candidateFrameId:'frame-000'}]},
  {...record,pairs:[record.pairs[0],{...record.pairs[0],id:'pair-001'}]},
  {...record,findings:[{...record.findings[0],pairId:'pair-missing'}]},
  {...record,findings:[record.findings[0],record.findings[0]]},
  {...record,frames:[{...record.frames[0],id:'../../secrets'},record.frames[1]]},
 ])('rejects invented, duplicate, unsafe or out-of-range evidence %#',value=>expect(videoRecordSchema.safeParse(value).success).toBe(false));
});
