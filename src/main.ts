import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/*
  RF Spectrum 3D Explorer
  ----------------------
  Loads preprocessed RF data (meta.json + power_u8.bin)
  and renders it as an interactive 3D surface.

  Axes:
    X → frequency
    Z → time
    Y → power
*/

const container = document.getElementById("app")!;

// ---------- Scene ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);

// ---------- Camera ----------
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  200
);
camera.position.set(1.5, 1.2, 1.5);

// ---------- Renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

// ---------- Controls ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// ---------- Lighting ----------
scene.add(new THREE.AmbientLight(0xffffff, 0.4));

const light = new THREE.DirectionalLight(0xffffff, 1.2);
light.position.set(2, 3, 2);
scene.add(light);

// ---------- Helpers ----------
scene.add(new THREE.AxesHelper(1));

// ---------- Load RF Data ----------
async function loadRFData() {
  // 1. Load metadata
  const meta = await fetch("/data/meta.json").then(r => r.json());

  const T = meta.shape.time;
  const H = meta.shape.height;
  const W = meta.shape.width;

  console.log("Loaded metadata:", meta.shape);

  // 2. Load binary power data
  const buffer = await fetch("/data/power_u8.bin").then(r => r.arrayBuffer());
  const raw = new Uint8Array(buffer);

  // Normalize power to [0, 1]
  const data = Float32Array.from(raw, v => v / 255);

  // ---------- Geometry ----------
  const geometry = new THREE.PlaneGeometry(
    1,
    1,
    W - 1,
    T - 1
  );
  geometry.rotateX(-Math.PI / 2);

  const positions = geometry.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(positions.count * 3);

  // ---------- Map data → surface ----------
  for (let i = 0; i < positions.count; i++) {
    const x = i % W;
    const z = Math.floor(i / W);

    // Index into flattened array
    const idx = z * W * H + Math.floor(H / 2) * W + x;

    const power = data[idx];

    // Height (Y)
    positions.setY(i, power * 0.6);

    // Color map (blue → yellow)
    const color = new THREE.Color();
    color.setHSL(0.65 - power * 0.6, 1.0, 0.5);

    colors[i * 3 + 0] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  // ---------- Material ----------
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.6,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
}

// ---------- Resize ----------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Animate ----------
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

loadRFData();
animate();
