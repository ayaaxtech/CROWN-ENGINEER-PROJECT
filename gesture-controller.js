import { FilesetResolver, HandLandmarker } from './vendor/vision_bundle.mjs';

const video = document.getElementById('handCam');
const button = document.getElementById('handToggle');
const status = document.getElementById('handStatus');
const cursor = document.getElementById('handCursor');
const scene = document.getElementById('scene');
const opacity = document.getElementById('opacity');
const explode = document.getElementById('explode');
const wire = document.getElementById('wire');

let landmarker = null;
let stream = null;
let running = false;
let busy = false;
let lastVideoTime = -1;
let lastPoint = null;
let pinch = false;
let peaceFrames = 0;
let fistFrames = 0;
let lastAction = 0;
let angle = 0;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function metrics(lm) {
  const span = Math.max(0.0001, dist(lm[0], lm[9]));
  const curl = i => dist(lm[i], lm[0]) / span;
  const tips = [curl(8), curl(12), curl(16), curl(20)];
  return {
    pinch: dist(lm[4], lm[8]) / span,
    open: tips.every(v => v > 1.45),
    fist: tips.every(v => v < 1.05),
    point: tips[0] > 1.45 && tips[1] < 1.15 && tips[2] < 1.15 && tips[3] < 1.15,
    peace: tips[0] > 1.45 && tips[1] > 1.45 && tips[2] < 1.15 && tips[3] < 1.15,
    tip: lm[8]
  };
}
function setStatus(text, good = false) {
  if (!status) return;
  status.textContent = text;
  status.dataset.good = good ? 'true' : 'false';
}
function setCursor(m) {
  if (!cursor || !m) return;
  cursor.style.display = 'block';
  cursor.style.left = `${(1 - m.tip.x) * 100}vw`;
  cursor.style.top = `${m.tip.y * 100}vh`;
}
function clearCursor() { if (cursor) cursor.style.display = 'none'; }
function toggle(buttonEl) {
  buttonEl.click();
}
function resetView() {
  angle = 0;
  if (opacity) opacity.value = 88;
  if (explode?.classList.contains('on')) toggle(explode);
  if (wire?.classList.contains('on')) toggle(wire);
  window.dispatchEvent(new Event('resize'));
}
function applyGesture(m) {
  const now = performance.now();
  setCursor(m);
  if (m.point && !m.pinch) {
    if (lastPoint) angle += (m.tip.x - lastPoint.x) * 3.2;
    lastPoint = m.tip;
    scene.style.transform = `rotate(${angle}deg)`;
  } else lastPoint = null;

  const touching = m.pinch < 0.30;
  if (touching && !pinch) {
    pinch = true;
    if (now - lastAction > 600) { toggle(explode); lastAction = now; setStatus('pinch detected · exploded view toggled', true); }
  } else if (!touching && m.pinch > 0.42) pinch = false;

  peaceFrames = m.peace ? peaceFrames + 1 : 0;
  if (peaceFrames === 8 && now - lastAction > 1200) {
    resetView(); lastAction = now; setStatus('peace sign detected · view reset', true);
  }
  fistFrames = m.fist ? fistFrames + 1 : 0;
  if (fistFrames === 8 && now - lastAction > 1200) {
    toggle(wire); lastAction = now; setStatus('fist detected · wireframe toggled', true);
  }
  if (m.open && !touching) setStatus('open palm · tracking live', true);
}
async function ensureLandmarker() {
  if (landmarker) return;
  setStatus('loading local Holo vision model…');
  const files = await FilesetResolver.forVisionTasks('./vendor/wasm');
  const options = delegate => ({
    baseOptions: { modelAssetPath: './vendor/hand_landmarker.task', delegate },
    runningMode: 'VIDEO', numHands: 2,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.6
  });
  try { landmarker = await HandLandmarker.createFromOptions(files, options('GPU')); }
  catch (gpuError) { console.warn('Holo GPU fallback to CPU', gpuError); landmarker = await HandLandmarker.createFromOptions(files, options('CPU')); }
}
async function start() {
  if (running || busy) return;
  busy = true; button.disabled = true;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API unavailable; use the HTTPS Netlify URL.');
    await ensureLandmarker();
    setStatus('requesting camera permission…');
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: 'user' }, audio: false });
    video.srcObject = stream; await video.play(); video.style.display = 'block';
    running = true; button.textContent = 'HANDS ON'; button.classList.add('on'); button.disabled = false;
    setStatus('hands live · processing on this device', true); requestAnimationFrame(loop);
  } catch (error) {
    console.error('Holo startup failed', error);
    setStatus(error.name === 'NotAllowedError' ? 'camera blocked · allow camera in browser settings, then retry' : `Holo unavailable · ${error.message}`);
    button.disabled = false; button.textContent = 'START HANDS';
  } finally { busy = false; }
}
function stop() {
  running = false; if (stream) stream.getTracks().forEach(t => t.stop()); stream = null;
  video.srcObject = null; video.style.display = 'none'; clearCursor(); lastPoint = null; pinch = false;
  button.textContent = 'START HANDS'; button.classList.remove('on'); setStatus('hands paused');
}
function loop() {
  if (!running) return;
  if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const result = landmarker.detectForVideo(video, performance.now());
    const first = result.landmarks?.[0];
    if (first) applyGesture(metrics(first)); else { clearCursor(); setStatus('hands live · show one hand to camera', true); }
  }
  requestAnimationFrame(loop);
}
button.addEventListener('click', () => running ? stop() : start());
window.addEventListener('beforeunload', stop);
