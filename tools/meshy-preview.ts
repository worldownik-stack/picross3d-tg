/**
 * `npm run meshy:preview [-- id ...]`: превью Meshy-модели content/meshy/raw/<id>.glb →
 * content/meshy/raw/<id>.png (вид 3/4 спереди) для миниатюр ревью (§6.3). Meshy MCP не
 * отдаёт ссылку на свою миниатюру, поэтому рендерим GLB сами. Без аргументов — все GLB.
 */
import { chromium } from '@playwright/test';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const RAW = 'content/meshy/raw';
const HOST = 'http://meshy.local';
const only = process.argv.slice(2);
const ids = only.length
  ? only
  : readdirSync(RAW)
      .filter((f) => f.endsWith('.glb'))
      .map((f) => f.slice(0, -4));

const MIME: Record<string, string> = {
  '.js': 'text/javascript',
  '.glb': 'model/gltf-binary',
  '.html': 'text/html',
};

const PAGE = `<!doctype html><html><body style="margin:0;background:#fff">
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const S = 600;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(S, S);
renderer.setClearColor(0xffffff, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0xb0a898, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(2, 4, 3);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
window.render = async (url) => {
  const gltf = await new GLTFLoader().loadAsync(url);
  const root = gltf.scene;
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);
  scene.add(root);
  const r = size.length() / 2;
  const dist = r / Math.sin((camera.fov * Math.PI) / 360) * 1.05;
  const dir = new THREE.Vector3(0.55, 0.45, 1).normalize();
  camera.position.copy(dir.multiplyScalar(dist));
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
  scene.remove(root);
  return renderer.domElement.toDataURL('image/png');
};
window.ready = true;
</script></body></html>`;

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
await page.route(`${HOST}/**`, async (route) => {
  const path = decodeURIComponent(new URL(route.request().url()).pathname);
  if (path === '/') return route.fulfill({ body: PAGE, contentType: MIME['.html'] });
  const file = path.startsWith('/three/')
    ? join('node_modules', path)
    : path.startsWith('/raw/')
      ? join(RAW, path.slice(5))
      : null;
  if (!file || !existsSync(file)) return route.fulfill({ status: 404 });
  return route.fulfill({
    body: readFileSync(file),
    contentType: MIME[extname(file)] ?? 'application/octet-stream',
  });
});
await page.goto(`${HOST}/`);
await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready);

for (const id of ids) {
  if (!existsSync(`${RAW}/${id}.glb`)) {
    console.warn(`${id}: нет ${RAW}/${id}.glb`);
    continue;
  }
  const url = await page.evaluate(
    (u) => (window as unknown as { render(u: string): Promise<string> }).render(u),
    `/raw/${id}.glb`,
  );
  writeFileSync(`${RAW}/${id}.png`, Buffer.from(url.split(',')[1]!, 'base64'));
  console.log(`${RAW}/${id}.png`);
}
await browser.close();
