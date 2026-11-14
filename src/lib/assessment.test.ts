import {describe,it,expect} from 'vitest';
import {parseFindings} from './continuity';
const finding={category:'props',description:'Watch missing',referenceEvidence:'Silver band visible',candidateEvidence:'Bare wrist visible',uncertainty:'Could be scripted',suggestedAction:'Review scripted action'};
describe('evidence-qualified assessment',()=>{
 it('retains justified severity and qualitative confidence',()=>{const r=parseFindings(JSON.stringify({summary:'Potential difference',findings:[{...finding,severity:'medium',confidence:{level:'tentative',basis:'Both wrists visible but scripted action unknown'}}]}));expect(r.findings[0]).toMatchObject({severity:'medium',confidence:{level:'tentative'}});});
 it('rejects invented numeric confidence and missing basis',()=>{for(const confidence of [0.98,{level:'strong'}])expect(()=>parseFindings(JSON.stringify({summary:'Potential difference',findings:[{...finding,confidence}]}))).toThrow();});
});
