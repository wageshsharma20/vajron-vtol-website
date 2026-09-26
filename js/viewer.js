// =====================================================================
// Live 3D viewer for the page (hero and flight-mode module).
// Horizontal drag turns the aircraft; vertical swipes still scroll the
// page (touch-action: pan-y), so it behaves on iPad. Renders only while
// on screen and the page is visible; shows the static render if WebGL
// is unavailable.
// =====================================================================
import * as THREE from 'three';
import { createStage } from './stage.js';
import { buildVTOL } from './vtol.js';

export function mountViewer(canvas, opt = {}) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let S;
  try {
    S = createStage(canvas, { alpha: true, shadows: false, envIntensity: opt.env ?? 0.62, pixelRatio: Math.min(window.devicePixelRatio || 1, 2) });
  } catch (e) { return null; }
  if (!S.renderer.getContext()) return null;

  const vtol = buildVTOL(THREE);
  const pivot = new THREE.Group();
  vtol.group.position.x = 0.19;                 // visual centre of the airframe onto the pivot
  pivot.add(vtol.group);
  S.scene.add(pivot);
  S.contact.visible = true;
  vtol.snap(opt.mode || 'idle');

  let yaw = opt.yaw ?? -0.62, vel = 0, dragging = false, lastX = 0, lastT = 0, idle = 0, moved = false;
  const elev = opt.elev ?? 0.3, fov = opt.fov ?? 26, fit = opt.fit ?? 0.84;
  let visible = false, raf = 0, clock = performance.now(), bob = 0;

  function frameCamera() {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    S.resize(w, h);
    S.camera.fov = fov;
    const vf = fov * Math.PI / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * (w / h));
    // wide, flat subject: fit the span horizontally and the height vertically
    const d = Math.max(1.12 / Math.tan(hf / 2), 0.62 / Math.tan(vf / 2)) * fit;
    S.camera.position.set(0, d * Math.sin(elev), d * Math.cos(elev));
    S.camera.lookAt(0, opt.lookY ?? -0.02, 0);
    S.camera.updateProjectionMatrix();
  }

  function tick(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - clock) / 1000); clock = now;
    if (!dragging) {
      if (Math.abs(vel) > 0.0005) { yaw += vel * dt; vel *= Math.pow(0.04, dt); }
      else if (!reduce && opt.autoRotate !== false) { idle += dt; if (idle > 2.2) yaw += 0.16 * dt; }
    }
    pivot.rotation.y = yaw;
    if (!reduce) { bob += dt; pivot.position.y = Math.sin(bob * 1.1) * 0.012; }
    vtol.update(dt);
    S.render();
    if (!canvas.classList.contains('is-ready')) { canvas.classList.add('is-ready'); opt.onReady && opt.onReady(); }
    if (visible && !document.hidden) raf = requestAnimationFrame(tick);
  }
  const start = () => { if (!raf && visible && !document.hidden) { clock = performance.now(); raf = requestAnimationFrame(tick); } };
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };

  // interaction: horizontal drag rotates, vertical movement is left to the page
  canvas.style.touchAction = 'pan-y';
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true; moved = false; lastX = e.clientX; lastT = performance.now(); vel = 0; idle = 0;
    canvas.classList.add('is-dragging');
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const now = performance.now(), dx = e.clientX - lastX, dts = Math.max(0.008, (now - lastT) / 1000);
    if (Math.abs(dx) > 2) moved = true;
    const d = dx * 0.0085;
    yaw += d; vel = d / dts; lastX = e.clientX; lastT = now;
    if (moved && opt.onInteract) opt.onInteract();
  }, { passive: true });
  const end = () => { if (!dragging) return; dragging = false; idle = 0; canvas.classList.remove('is-dragging'); };
  window.addEventListener('pointerup', end, { passive: true });
  window.addEventListener('pointercancel', end, { passive: true });

  const ro = new ResizeObserver(() => { frameCamera(); if (!raf) S.render(); });
  ro.observe(canvas);
  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; visible ? start() : stop(); }, { threshold: 0.02 });
  io.observe(canvas);
  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });
  frameCamera();

  return {
    setMode(m) { vtol.setMode(m); idle = 0; start(); },
    snap(m) { vtol.snap(m); start(); },
    get mode() { return vtol.mode; },
  };
}
