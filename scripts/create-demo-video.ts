import sharp from 'sharp';
import { execFile } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
// Original synthetic video, not footage or model output. Three shots; the silver wristwatch is on the actor's
// wrist in shots 1 and 2 and missing in shot 3. This is a scripted difference to test detection, not a detection.
const run = promisify(execFile);
const SHOTS = [
  { name: 'wide', bg: '#d4c8b5', wall: '#718d9e', watch: true, scale: 1, seconds: 6 },
  { name: 'close', bg: '#b9a98f', wall: '#4d6a7a', watch: true, scale: 1, seconds: 6 },
  { name: 'wide-again', bg: '#d4c8b5', wall: '#718d9e', watch: false, scale: 1, seconds: 6 },
];
function svg(shot: (typeof SHOTS)[number]) {
  const watch = shot.watch ? '<rect x="390" y="415" width="30" height="45" fill="#b9c0c6"/><circle cx="405" cy="437" r="15" fill="#eeeeee" stroke="#555" stroke-width="3"/>' : '';
  const cup = '<rect x="650" y="455" width="60" height="65" rx="10" fill="#fafafa"/><ellipse cx="680" cy="457" rx="30" ry="8" fill="#37281f"/><circle cx="722" cy="485" r="17" stroke="#fafafa" stroke-width="9" fill="none"/>';
  const view = shot.name === 'close' ? '250 150 560 392' : '0 0 1000 700';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700" viewBox="${view}"><rect x="-100" y="-100" width="1200" height="900" fill="${shot.bg}"/><rect x="30" y="30" width="300" height="220" fill="${shot.wall}"/><rect x="80" y="430" width="840" height="220" rx="20" fill="#795b42"/><circle cx="500" cy="220" r="65" fill="#d69c79"/><rect x="410" y="285" width="180" height="200" rx="35" fill="#334959"/><rect x="340" y="420" width="240" height="35" rx="17" fill="#d69c79"/>${watch}${cup}<rect x="230" y="510" width="65" height="110" rx="8" fill="#1d2226"/><rect x="480" y="530" width="120" height="80" rx="4" fill="#b1bc96"/></svg>`;
}
async function main() {
  const dir = resolve(process.argv[2] || '.demo-video');
  const ffmpeg = process.env.FFMPEG_PATH?.trim() || 'ffmpeg';
  await mkdir(dir, { recursive: true });
  const inputs: string[] = [];
  for (const [i, shot] of SHOTS.entries()) {
    const file = resolve(dir, `shot${i}.png`);
    await sharp(Buffer.from(svg(shot))).resize(960, 672, { fit: 'fill' }).png().toFile(file);
    inputs.push('-loop', '1', '-framerate', '12', '-t', String(shot.seconds), '-i', file);
  }
  const out = resolve(dir, 'continuity-demo.mp4');
  const chains = SHOTS.map((_, i) => `[${i}:v]format=yuv420p,setsar=1[v${i}]`).join(';');
  const join = `${SHOTS.map((_, i) => `[v${i}]`).join('')}concat=n=${SHOTS.length}:v=1:a=0[out]`;
  await run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', `${chains};${join}`, '-map', '[out]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-movflags', '+faststart', out]);
  await Promise.all(SHOTS.map((_, i) => rm(resolve(dir, `shot${i}.png`), { force: true })));
  console.log(`Created original synthetic demo video ${out}. Shots change at 6s and 12s; the wristwatch disappears in shot 3. No AI calls made. This is a scripted difference, not a detection.`);
}
main().catch(error => { console.error('Could not create demo video:', error instanceof Error ? error.message : 'unknown error'); process.exitCode = 1; });
