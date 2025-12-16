import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const container = document.getElementById("app") as HTMLDivElement;
// UI
const modeSingle = document.getElementById("modeSingle") as HTMLInputElement;
const modeMulti = document.getElementById("modeMulti") as HTMLInputElement;

const singleBox = document.getElementById("singleBox") as HTMLDivElement;
const multiBox = document.getElementById("multiBox") as HTMLDivElement;

const singleFile = document.getElementById("singleFile") as HTMLInputElement;
const singleDownsample = document.getElementById("singleDownsample") as HTMLInputElement;

const multiFiles = document.getElementById("multiFiles") as HTMLInputElement;
const rowMode = document.getElementById("rowMode") as HTMLSelectElement;

const analyzeBtn = document.getElementById("analyzeBtn") as HTMLButtonElement;
const loadSampleBtn = document.getElementById("loadSampleBtn") as HTMLButtonElement;

const statusEl = document.getElementById("status") as HTMLDivElement;
const readoutEl = document.getElementById("readout") as HTMLDivElement;

const toggleSurface = document.getElementById("toggleSurface") as HTMLInputElement;
const toggleAxes = document.getElementById("toggleAxes") as HTMLInputElement;
const toggleLabels = document.getElementById("toggleLabels") as HTMLInputElement;

//three.js scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(1.6, 1.2, 1.6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.AmbientLight(0xffffff, 0.45));
const sun = new THREE.DirectionalLight(0xffffff, 1.15);
sun.position.set(2, 3, 2);
scene.add(sun);

// Axes
const axesHelper = new THREE.AxesHelper(1);
scene.add(axesHelper);

let surfaceMesh: THREE.Mesh | null = null;

// Axis label sprites
let xLabel: THREE.Sprite | null = null;
let yLabel: THREE.Sprite | null = null;
let zLabel: THREE.Sprite | null = null;

const raycaster = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2();

type MeshMeta =
  | { mode: "single"; W: number; H: number; ds: number } 
  | { mode: "multi"; W: number; T: number };             

let currentMeshMeta: MeshMeta | null = null;

// Helpers
function setStatus(msg: string) {
  statusEl.textContent = msg;
}

function setReadout(msg: string) {
  readoutEl.textContent = msg;
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function powerToColor(power01: number) {
  const p = clamp01(power01);
  const c = new THREE.Color();
  c.setHSL(0.62 - p * 0.55, 1.0, 0.5);
  return c;
}

function createTextSprite(text: string, color = "#ffffff") {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const fontSize = 48;

  ctx.font = `${fontSize}px Arial`;
  const textWidth = ctx.measureText(text).width;

  canvas.width = Math.ceil(textWidth + 20);
  canvas.height = fontSize + 20;

  ctx.font = `${fontSize}px Arial`;
  ctx.fillStyle = color;
  ctx.fillText(text, 10, fontSize);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.22, 0.11, 1); 
  return sprite;
}

function ensureAxisLabels() {
  if (!xLabel) {
    xLabel = createTextSprite("Frequency (MHz)");
    xLabel.position.set(0.6, 0.02, 0);
    scene.add(xLabel);
  }
  if (!yLabel) {
    yLabel = createTextSprite("Power (dBm)");
    yLabel.position.set(0, 0.7, 0);
    scene.add(yLabel);
  }
  if (!zLabel) {
    zLabel = createTextSprite("Time");
    zLabel.position.set(0, 0.02, 0.6);
    scene.add(zLabel);
  }
}

function applyLayerVisibility() {
  if (surfaceMesh) surfaceMesh.visible = toggleSurface.checked;
  axesHelper.visible = toggleAxes.checked;

  const labelsVisible = toggleLabels.checked;
  if (xLabel) xLabel.visible = labelsVisible;
  if (yLabel) yLabel.visible = labelsVisible;
  if (zLabel) zLabel.visible = labelsVisible;
}

function replaceSurface(mesh: THREE.Mesh, meta: MeshMeta) {
  if (surfaceMesh) {
    scene.remove(surfaceMesh);
    surfaceMesh.geometry.dispose();
    (surfaceMesh.material as THREE.Material).dispose();
  }
  surfaceMesh = mesh;
  currentMeshMeta = meta;
  scene.add(mesh);
  applyLayerVisibility();
}

// Image loading helpers 
function readFileAsDataURL(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataURL(dataURL: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image failed to load."));
    img.src = dataURL;
  });
}

function imageToGrayscaleGrid(img: HTMLImageElement, targetW: number, targetH: number) {
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D canvas context.");

  ctx.drawImage(img, 0, 0, targetW, targetH);

  const pixels = ctx.getImageData(0, 0, targetW, targetH).data;
  const out = new Float32Array(targetW * targetH);

  for (let i = 0; i < targetW * targetH; i++) {
    const r = pixels[i * 4 + 0];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    const gray = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    out[i] = gray;
  }

  return out; 
}

function imageToGrayscaleRow(img: HTMLImageElement, targetW: number, targetH: number, rowIndex: number) {
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D canvas context.");

  ctx.drawImage(img, 0, 0, targetW, targetH);

  const y = Math.max(0, Math.min(targetH - 1, rowIndex));
  const rowData = ctx.getImageData(0, y, targetW, 1).data;

  const out = new Float32Array(targetW);
  for (let x = 0; x < targetW; x++) {
    const r = rowData[x * 4 + 0];
    const g = rowData[x * 4 + 1];
    const b = rowData[x * 4 + 2];
    const gray = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    out[x] = gray;
  }
  return out;
}

// builders

// single image mode
function buildSingleImageSurface(grid: Float32Array, W: number, H: number, downsample: number) {
  
  const ds = Math.max(1, Math.floor(downsample));

  const Wd = Math.max(2, Math.floor(W / ds));
  const Hd = Math.max(2, Math.floor(H / ds));

  const geometry = new THREE.PlaneGeometry(1, 1, Wd - 1, Hd - 1);
  geometry.rotateX(-Math.PI / 2);

  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const x = i % Wd;
    const z = Math.floor(i / Wd);

    const srcX = Math.min(W - 1, x * ds);
    const srcY = Math.min(H - 1, z * ds);

    const power = grid[srcY * W + srcX]; // [0..1]

    pos.setY(i, power * 0.65);

    const c = powerToColor(power);
    colors[i * 3 + 0] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.65,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  replaceSurface(mesh, { mode: "single", W: Wd, H: Hd, ds });
  setStatus(`Single Image: ${W}x${H} → displayed as ${Wd}x${Hd} (downsample=${ds}).`);
}

// multi-image compare mode
function buildMultiCompareSurface(slices: Float32Array[], W: number, T: number) {
  const geometry = new THREE.PlaneGeometry(1, 1, W - 1, T - 1);
  geometry.rotateX(-Math.PI / 2);

  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const x = i % W;
    const z = Math.floor(i / W);
    const power = slices[z][x];

    pos.setY(i, power * 0.65);

    const c = powerToColor(power);
    colors[i * 3 + 0] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.65,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  replaceSurface(mesh, { mode: "multi", W, T });
  setStatus(`Multi Compare: ${T} images, width=${W} (row sampling = ${rowMode.value}).`);
}

// loaders
async function analyzeSingle() {
  if (!singleFile.files || singleFile.files.length === 0) {
    setStatus("Single Image mode: select one image first.");
    return;
  }

  const file = singleFile.files[0];
  if (!file.type.startsWith("image/")) {
    setStatus("Single Image mode: that file is not an image.");
    return;
  }

  setStatus(`Loading: ${file.name} ...`);

  const dataURL = await readFileAsDataURL(file);
  const img = await loadImageFromDataURL(dataURL);

  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;

  const grid = imageToGrayscaleGrid(img, W, H);

  const ds = parseInt(singleDownsample.value, 10) || 1;
  ensureAxisLabels();
  buildSingleImageSurface(grid, W, H, ds);
}

async function analyzeMulti() {
  if (!multiFiles.files || multiFiles.files.length === 0) {
    setStatus("Multi-Image Compare mode: select multiple images first.");
    return;
  }

  const list = Array.from(multiFiles.files).filter(f => f.type.startsWith("image/"));
  if (list.length === 0) {
    setStatus("Multi-Image Compare mode: no valid images were selected.");
    return;
  }

  setStatus(`Reading ${list.length} image(s)...`);

  const images: HTMLImageElement[] = [];
  for (const f of list) {
    const dataURL = await readFileAsDataURL(f);
    const img = await loadImageFromDataURL(dataURL);
    images.push(img);
  }

  // Standardize size based on the first image
  const targetW = images[0].naturalWidth || images[0].width;
  const targetH = images[0].naturalHeight || images[0].height;

  let y = Math.floor(targetH / 2);
  if (rowMode.value === "top") y = 0;
  if (rowMode.value === "bottom") y = targetH - 1;

  const slices: Float32Array[] = [];
  for (const img of images) {
    const row = imageToGrayscaleRow(img, targetW, targetH, y);
    slices.push(row);
  }

  ensureAxisLabels();
  buildMultiCompareSurface(slices, targetW, slices.length);
}

async function loadSampleFromPublicData() {
  setStatus("Loading sample from /data ...");

  const meta = await fetch("/data/meta.json").then(r => r.json());
  const T = meta.shape.time as number;
  const H = meta.shape.height as number;
  const W = meta.shape.width as number;

  const buffer = await fetch("/data/power_u8.bin").then(r => r.arrayBuffer());
  const raw = new Uint8Array(buffer);
  const data = Float32Array.from(raw, v => v / 255);

  const midRow = Math.floor(H / 2);
  const slices: Float32Array[] = [];

  for (let t = 0; t < T; t++) {
    const row = new Float32Array(W);
    const base = t * W * H + midRow * W;
    for (let x = 0; x < W; x++) row[x] = data[base + x];
    slices.push(row);
  }

  ensureAxisLabels();
  buildMultiCompareSurface(slices, W, T);
  setStatus(`Loaded sample: ${T} slices from /data (middle row).`);
}

function updateMouseNDC(evt: MouseEvent) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouseNDC.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
  mouseNDC.y = -(((evt.clientY - rect.top) / rect.height) * 2 - 1);
}

function handleHover() {
  if (!surfaceMesh || !surfaceMesh.visible || !currentMeshMeta) {
    setReadout("Hover over the surface to see values.");
    return;
  }

  raycaster.setFromCamera(mouseNDC, camera);
  const hits = raycaster.intersectObject(surfaceMesh, false);
  if (hits.length === 0) {
    setReadout("Hover over the surface to see values.");
    return;
  }

  const hit = hits[0];

  // Get UV coords
  if (!hit.uv) {
    setReadout("Hover readout unavailable (no UV).");
    return;
  }

  const uv = hit.uv;

  const meta = currentMeshMeta;

  if (meta.mode === "single") {
    const W = meta.W;
    const H = meta.H;

    const xBin = Math.max(0, Math.min(W - 1, Math.floor(uv.x * (W - 1))));
    const zBin = Math.max(0, Math.min(H - 1, Math.floor((1 - uv.y) * (H - 1))));

    const yVal = hit.point.y; 
    const power01 = clamp01(yVal / 0.65);

    setReadout(
      `Single: freq_bin=${xBin}  time_row=${zBin}  power≈${power01.toFixed(3)} (normalized)`
    );
    return;
  }

  if (meta.mode === "multi") {
    const W = meta.W;
    const T = meta.T;

    const xBin = Math.max(0, Math.min(W - 1, Math.floor(uv.x * (W - 1))));
    const tBin = Math.max(0, Math.min(T - 1, Math.floor((1 - uv.y) * (T - 1))));

    const yVal = hit.point.y;
    const power01 = clamp01(yVal / 0.65);

    setReadout(
      `Multi: freq_bin=${xBin}  image_index=${tBin}  power≈${power01.toFixed(3)} (normalized)`
    );
  }
}

// ui sync
function syncModeUI() {
  const isSingle = modeSingle.checked;

  if (isSingle) {
    singleBox.classList.remove("hidden");
    multiBox.classList.add("hidden");
    setStatus("Single Image mode: upload one image and click Analyze.");
  } else {
    multiBox.classList.remove("hidden");
    singleBox.classList.add("hidden");
    setStatus("Multi-Image Compare mode: upload multiple images and click Analyze.");
  }
}

modeSingle.addEventListener("change", syncModeUI);
modeMulti.addEventListener("change", syncModeUI);

toggleSurface.addEventListener("change", applyLayerVisibility);
toggleAxes.addEventListener("change", applyLayerVisibility);
toggleLabels.addEventListener("change", applyLayerVisibility);

analyzeBtn.addEventListener("click", async () => {
  try {
    ensureAxisLabels();
    if (modeSingle.checked) await analyzeSingle();
    else await analyzeMulti();
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${(err as Error).message}`);
  }
});

loadSampleBtn.addEventListener("click", async () => {
  try {
    ensureAxisLabels();
    await loadSampleFromPublicData();
  } catch (err) {
    console.error(err);
    setStatus(`Error loading sample: ${(err as Error).message}`);
  }
});

renderer.domElement.addEventListener("mousemove", (evt) => {
  updateMouseNDC(evt);
  handleHover();
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
ensureAxisLabels();
applyLayerVisibility();
syncModeUI();
animate();
