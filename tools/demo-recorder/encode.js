/**
 * Encodes ./frames into:
 *   - docs/demo/csp-phase2-walkthrough.mp4 (1920x1080, H.264, ~6 fps)
 *   - docs/demo/csp-phase2-walkthrough.gif (960x540, palette method)
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const FRAMES = path.resolve(__dirname, 'frames', 'frame_%05d.png');
const OUT_DIR = path.resolve(__dirname, '..', '..', 'docs', 'demo');
const MP4 = path.join(OUT_DIR, 'csp-phase2-walkthrough.mp4');
const GIF = path.join(OUT_DIR, 'csp-phase2-walkthrough.gif');
const PALETTE = path.join(OUT_DIR, 'palette.png');

fs.mkdirSync(OUT_DIR, { recursive: true });

const FPS = 6;

function run(args) {
  console.log('ffmpeg', args.join(' '));
  const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed (${r.status})`);
}

console.log('Encoding MP4…');
run([
  '-y',
  '-framerate',
  String(FPS),
  '-i',
  FRAMES,
  '-vf',
  'scale=1920:1080:flags=lanczos,format=yuv420p',
  '-c:v',
  'libx264',
  '-preset',
  'medium',
  '-crf',
  '20',
  '-movflags',
  '+faststart',
  MP4,
]);

console.log('Generating GIF palette…');
run([
  '-y',
  '-framerate',
  String(FPS),
  '-i',
  FRAMES,
  '-vf',
  'scale=960:540:flags=lanczos,palettegen=stats_mode=diff',
  PALETTE,
]);

console.log('Encoding GIF…');
run([
  '-y',
  '-framerate',
  String(FPS),
  '-i',
  FRAMES,
  '-i',
  PALETTE,
  '-lavfi',
  'scale=960:540:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5',
  GIF,
]);

fs.unlinkSync(PALETTE);

const stat = (p) => (fs.existsSync(p) ? (fs.statSync(p).size / 1024 / 1024).toFixed(1) + ' MB' : 'missing');
console.log('--- Output ---');
console.log(`MP4: ${MP4} (${stat(MP4)})`);
console.log(`GIF: ${GIF} (${stat(GIF)})`);
