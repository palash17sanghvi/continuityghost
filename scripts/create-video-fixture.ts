import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMediaTool } from '../src/lib/video-extraction';

/** Deterministic, silent 15s clip: watch present, cutaway, same view without watch. */
export async function createVideoFixture(output: string) {
  await mkdir(path.dirname(output), {recursive:true});
  const actor = 'drawbox=x=230:y=55:w=180:h=250:color=tan:t=fill,drawbox=x=160:y=240:w=320:h=40:color=tan:t=fill';
  await runMediaTool('ffmpeg', ['-hide_banner','-nostdin','-loglevel','error','-y','-filter_threads','1',
    '-f','lavfi','-i',`color=c=0x303d52:s=640x360:r=10:d=15,${actor},drawbox=x=180:y=240:w=34:h=40:color=black:t=fill:enable='lt(t,5)',drawbox=x=0:y=0:w=640:h=360:color=0xb0bc83:t=fill:enable='between(t,5,7.9)'`,
    '-an','-c:v','libx264','-preset','ultrafast','-threads','2','-pix_fmt','yuv420p','-movflags','+faststart',output]);
  return output;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv[2];
  if (!output) throw new Error('Usage: tsx scripts/create-video-fixture.ts OUTPUT.mp4');
  createVideoFixture(path.resolve(output)).then(() => {
    console.log(`Created deterministic 15-second watch-change fixture: ${output}`);
  }).catch(() => { console.error('Local fixture generation failed.'); process.exitCode = 1; });
}
