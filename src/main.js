import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/controls/OrbitControls.js';
import { generateStealthMaze, CELL_WALL, gridCellCenter } from './maze.js';
import { NPC } from './npc.js';
import { astar } from './pathfinding.js';

const cellSize = 1.4;
const mapSize = 32;
const grid = generateStealthMaze(mapSize);

class Navigator {
  constructor(grid) {
    this.grid = grid;
  }

  clampToFloor(cell) {
    const clamped = { x: Math.max(0, Math.min(this.grid.length - 1, Math.round(cell.x))), y: Math.max(0, Math.min(this.grid.length - 1, Math.round(cell.y))) };
    if (this.grid[clamped.y][clamped.x] === CELL_WALL) {
      return this.randomFloor();
    }
    return clamped;
  }

  randomFloor() {
    while (true) {
      const x = Math.floor(Math.random() * this.grid.length);
      const y = Math.floor(Math.random() * this.grid.length);
      if (this.grid[y][x] !== CELL_WALL) return { x, y };
    }
  }

  pathTo(start, goal) {
    return astar(this.grid, start, goal);
  }

  pathAwayFrom(start, threat) {
    const candidates = [
      { x: start.x + 3, y: start.y },
      { x: start.x - 3, y: start.y },
      { x: start.x, y: start.y + 3 },
      { x: start.x, y: start.y - 3 },
    ].map((c) => this.clampToFloor(c));
    candidates.sort((a, b) => distanceSq(b, threat) - distanceSq(a, threat));
    for (const c of candidates) {
      const path = this.pathTo(start, c);
      if (path.length) return path;
    }
    return [];
  }

  lineOfSight(a, b) {
    const points = bresenham(a.x, a.y, b.x, b.y);
    for (const p of points) {
      if (this.grid[p.y]?.[p.x] === CELL_WALL) return false;
    }
    return true;
  }
}

function distanceSq(a, b) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function bresenham(x0, y0, x1, y1) {
  const points = [];
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1;
  let sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  while (true) {
    if (!(x === x0 && y === y0)) points.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return points;
}

const navigator = new Navigator(grid);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c101a);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 300);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.maxDistance = 60;

const hemiLight = new THREE.HemisphereLight(0xddeeff, 0x0a0a10, 0.8);
scene.add(hemiLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
dirLight.position.set(10, 18, 8);
dirLight.castShadow = true;
scene.add(dirLight);

const floorGeo = new THREE.PlaneGeometry(mapSize * cellSize, mapSize * cellSize, 1, 1);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x1b1f2a, roughness: 0.8, metalness: 0.1 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const wallGeo = new THREE.BoxGeometry(cellSize, cellSize, cellSize);
const wallMat = new THREE.MeshStandardMaterial({ color: 0x192231, roughness: 0.5, metalness: 0.2 });
const walls = new THREE.InstancedMesh(wallGeo, wallMat, mapSize * mapSize);
let wallIndex = 0;
for (let y = 0; y < mapSize; y++) {
  for (let x = 0; x < mapSize; x++) {
    if (grid[y][x] === CELL_WALL) {
      const { x: wx, z: wz } = gridCellCenter(x, y, cellSize, mapSize);
      const matrix = new THREE.Matrix4();
      matrix.setPosition(wx, cellSize * 0.5, wz);
      walls.setMatrixAt(wallIndex++, matrix);
    }
  }
}
walls.count = wallIndex;
walls.castShadow = true;
walls.receiveShadow = true;
scene.add(walls);

const startA = navigator.randomFloor();
let startB = navigator.randomFloor();
while (distanceSq(startA, startB) < 25) {
  startB = navigator.randomFloor();
}

const npcA = new NPC({ id: 'A', color: 0x4cd964, grid, scene, cellSize, mapSize, start: startA });
const npcB = new NPC({ id: 'B', color: 0xff5e57, grid, scene, cellSize, mapSize, start: startB });

const markerGeo = new THREE.TetrahedronGeometry(cellSize * 0.3);
const markerMat = new THREE.MeshStandardMaterial({ color: 0xd3a4ff, emissive: 0x5a3f7a, emissiveIntensity: 0.6 });
const markerA = new THREE.Mesh(markerGeo, markerMat);
const markerB = new THREE.Mesh(markerGeo, markerMat.clone());
markerA.position.y = markerB.position.y = cellSize * 0.2;
scene.add(markerA);
scene.add(markerB);

camera.position.set(0, mapSize * 0.7, mapSize * 0.6);
controls.update();

let lastTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastTime) / 1000); // clamp to avoid spikes
  lastTime = now;

  npcA.update(dt, npcB, navigator);
  npcB.update(dt, npcA, navigator);

  updateMarker(markerA, npcA);
  updateMarker(markerB, npcB);

  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug overlay for NPC states
const info = document.getElementById('info');
const stateLabel = document.createElement('p');
info.appendChild(stateLabel);

function updateStateLabel() {
  stateLabel.textContent = `A: ${npcA.state} ${npcA.recognized ? '認知' : ''} | B: ${npcB.state} ${npcB.recognized ? '認知' : ''}`;
  requestAnimationFrame(updateStateLabel);
}
updateStateLabel();

function updateMarker(marker, npc) {
  const goal = npc.currentGoal ?? npc.position;
  const { x, z } = gridCellCenter(goal.x, goal.y, cellSize, mapSize);
  marker.position.x = x;
  marker.position.z = z;
}
