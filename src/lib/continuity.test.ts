import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { validateImage, parseFindings, analyzeImages, MAX_IMAGE_BYTES, geminiResponseSchema } from './continuity';

const finding = {category:'props',description:'Cup missing',referenceEvidence:'Cup on table',candidateEvidence:'Table visible without cup',uncertainty:'Could have been removed during action',suggestedAction:'Check script'};
describe('Gemini generation grammar and strict output validation',()=>{
  it('omits costly grammar bounds while preserving required fields and categories',()=>{
    const schema=JSON.stringify(geminiResponseSchema);
    for(const keyword of ['maxItems','minLength','maxLength'])expect(schema).not.toContain(keyword);
    expect(schema).toContain('referenceEvidence');expect(schema).toContain('wardrobe');
  });
  it('still rejects too many findings, empty evidence and oversized evidence locally',()=>{
    expect(()=>parseFindings(JSON.stringify({summary:'Comparison',findings:Array.from({length:31},()=>finding)}))).toThrow();
    for(const description of ['', 'x'.repeat(3001)])expect(()=>parseFindings(JSON.stringify({summary:'Comparison',findings:[{...finding,description}]}))).toThrow();
  });
});
describe('image trust boundary', () => {
  it.each(['jpeg','webp'] as const)('accepts real %s bytes',async format=>{const b=await sharp({create:{width:4,height:4,channels:3,background:'#fff'}}).toFormat(format).toBuffer();expect((await validateImage(new File([b],`frame.${format}`,{type:`image/${format}`}))).mimeType).toBe('image/jpeg');});
  it('rejects empty images',async()=>{await expect(validateImage(new File([],'empty.png',{type:'image/png'}))).rejects.toThrow();});
  it('flattens transparency to white and strips metadata',async()=>{const b=await sharp({create:{width:4,height:4,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).withMetadata().png().toBuffer();const result=await validateImage(new File([b],'transparent.png',{type:'image/png'}));const bytes=Buffer.from(result.data,'base64');const metadata=await sharp(bytes).metadata();expect(metadata.exif).toBeUndefined();const {data}=await sharp(bytes).raw().toBuffer({resolveWithObject:true});expect([...data.slice(0,3)]).toEqual([255,255,255]);});
  it('accepts decoded PNG',async()=>{const b=await sharp({create:{width:4,height:4,channels:3,background:'#fff'}}).png().toBuffer(); expect((await validateImage(new File([b],'a.png',{type:'image/png'}))).mimeType).toBe('image/jpeg');});
  it('rejects spoofed content',async()=>{await expect(validateImage(new File(['not image'],'a.png',{type:'image/png'}))).rejects.toThrow();});
  it('rejects mismatched MIME',async()=>{const b=await sharp({create:{width:4,height:4,channels:3,background:'#fff'}}).png().toBuffer(); await expect(validateImage(new File([b],'a.jpg',{type:'image/jpeg'}))).rejects.toThrow();});
  it('rejects SVG and oversized files',async()=>{await expect(validateImage(new File(['<svg/>'],'a.svg',{type:'image/svg+xml'}))).rejects.toThrow(); await expect(validateImage(new File([new Uint8Array(MAX_IMAGE_BYTES+1)],'a.png',{type:'image/png'}))).rejects.toThrow();});
});
describe('structured Gemini responses',()=>{
  it('parses findings and assigns server IDs and initial status',()=>{const r=parseFindings(JSON.stringify({summary:'One potential issue',findings:[finding]})); expect(r.findings[0]).toMatchObject({category:'props',status:'unreviewed'}); expect(r.findings[0].id).toBeTruthy();});
  it('accepts zero findings without inventing issues',()=>{expect(parseFindings('{"summary":"No supported differences","findings":[]}').findings).toEqual([]);});
  it.each(['not JSON','{}',JSON.stringify({summary:'test',findings:[{...finding,category:'unknown'}]}),JSON.stringify({summary:'test',findings:[{...finding,referenceEvidence:''}]})])('rejects malformed response %s',text=>{expect(()=>parseFindings(text)).toThrow();});
  it('passes only supplied images and scoped context to provider',async()=>{const generate=vi.fn().mockResolvedValue(JSON.stringify({summary:'Review',findings:[finding]})); const image={mimeType:'image/png',data:'YWJj'}; const r=await analyzeImages({projectId:'film-a',sceneId:'scene-1',context:'Watch removal intentional',reference:image,candidate:image},generate); expect(r.projectId).toBe('film-a'); expect(r.sceneId).toBe('scene-1'); expect(generate).toHaveBeenCalledOnce(); expect(JSON.stringify(generate.mock.calls)).toContain('Watch removal intentional');});
  it('does not swallow provider failures',async()=>{await expect(analyzeImages({projectId:'a',sceneId:'b',context:'',reference:{mimeType:'image/png',data:'a'},candidate:{mimeType:'image/png',data:'b'}},async()=>{throw new Error('unavailable')})).rejects.toThrow('unavailable');});
});
