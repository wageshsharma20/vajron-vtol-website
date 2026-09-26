// =====================================================================
// Studio stage shared by the live 3D views and the render tool:
// neutral tone mapping, studio reflections, key + rim light, soft
// contact shadow, optional shadow-catching floor.
// =====================================================================
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function createStage(canvas, opt = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: opt.alpha !== false,
    preserveDrawingBuffer: !!opt.capture, powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(opt.pixelRatio || Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = opt.exposure ?? 1.0;
  renderer.shadowMap.enabled = opt.shadows !== false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (opt.alpha !== false) renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = opt.envIntensity ?? 0.62;

  const camera = new THREE.PerspectiveCamera(opt.fov ?? 28, 16 / 9, 0.02, 60);

  const key = new THREE.DirectionalLight(0xffffff, opt.key ?? 2.3);
  key.position.set(2.2, 3.4, 2.0);
  key.castShadow = opt.shadows !== false;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -1.8; key.shadow.camera.right = 1.8;
  key.shadow.camera.top = 1.8; key.shadow.camera.bottom = -1.8;
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 10;
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 5;
  const rim = new THREE.DirectionalLight(0xdfe7f5, opt.rim ?? 1.3);
  rim.position.set(-2.6, 1.4, -2.2);
  const fill = new THREE.DirectionalLight(0xffffff, opt.fill ?? 0.35);
  fill.position.set(-1.5, -1.2, 2.5);
  scene.add(key, key.target, rim, fill);

  // soft contact shadow: a blurred ellipse under the aircraft
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const c = cv.getContext('2d');
  const gr = c.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(0.45, 'rgba(0,0,0,.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = gr; c.fillRect(0, 0, 256, 256);
  const shTex = new THREE.CanvasTexture(cv);
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.7),
    new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false, opacity: 0.9 }));
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = -0.213;
  contact.renderOrder = -1;
  scene.add(contact);

  // shadow-catching floor for ground shots (hidden by default)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.55 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.2118;
  floor.receiveShadow = true;
  floor.visible = false;
  scene.add(floor);

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const render = () => renderer.render(scene, camera);
  return { THREE, renderer, scene, camera, key, rim, fill, contact, floor, resize, render };
}
