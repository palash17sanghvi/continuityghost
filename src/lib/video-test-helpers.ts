import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ffmpegBin } from './video-ffmpeg';

const run = promisify(execFile);
/** Three solid shots of 2 s each: black 0-2, white 2-4, gray 4-6. Known cuts make timestamp accuracy testable.
 * Colours differ in brightness on purpose: FFmpeg's scene score is luma-based, so equal-brightness hues (red vs green) score 0. */
export async function makeColorVideo(file: string, colors = ['black', 'white', 'gray'], seconds = 2) {
  const inputs = colors.flatMap(c => ['-f', 'lavfi', '-i', `color=c=${c}:s=160x120:r=10:d=${seconds}`]);
  const join_ = `${colors.map((_, i) => `[${i}:v]format=yuv420p[v${i}]`).join(';')};${colors.map((_, i) => `[v${i}]`).join('')}concat=n=${colors.length}:v=1:a=0[out]`;
  await run(ffmpegBin(), ['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', join_, '-map', '[out]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file]);
}
