import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
// Original geometric restaurant illustration, not footage or model output.
async function main(){
const dir=resolve(process.argv[2] || '.demo-images');
await mkdir(dir,{recursive:true});
for(const [name,watch,cup] of [['reference',true,true],['candidate',false,true]] as const){
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700"><rect width="1000" height="700" fill="#d4c8b5"/><rect x="30" y="30" width="300" height="220" fill="#718d9e"/><rect x="80" y="430" width="840" height="220" rx="20" fill="#795b42"/><circle cx="500" cy="220" r="65" fill="#d69c79"/><rect x="410" y="285" width="180" height="200" rx="35" fill="#334959"/><rect x="340" y="420" width="240" height="35" rx="17" fill="#d69c79"/>${watch?'<rect x="390" y="415" width="30" height="45" fill="#b9c0c6"/><circle cx="405" cy="437" r="15" fill="#eeeeee" stroke="#555" stroke-width="3"/>':''}${cup?'<rect x="650" y="455" width="60" height="65" rx="10" fill="#fafafa"/><ellipse cx="680" cy="457" rx="30" ry="8" fill="#37281f"/><circle cx="722" cy="485" r="17" stroke="#fafafa" stroke-width="9" fill="none"/>':''}<rect x="230" y="510" width="65" height="110" rx="8" fill="#1d2226"/><rect x="480" y="530" width="120" height="80" rx="4" fill="#b1bc96"/></svg>`;
 await sharp(Buffer.from(svg)).png().toFile(resolve(dir,`${name}.png`));
}
console.log(`Created original synthetic illustrations in ${dir}. Reference has silver watch; candidate omits it. No AI calls made. These are expected scene differences, not detected findings.`);
}
main().catch(()=>{console.error('Could not create demo images.');process.exitCode=1;});
