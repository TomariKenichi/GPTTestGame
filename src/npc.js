import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';
import { CELL_WALL, gridCellCenter } from './maze.js';

export const NPC_STATE = {
  EXPLORE: 'explore',
  SCAN: 'scan',
  CHASE: 'chase',
  FLANK: 'flank',
  LOST: 'lost',
  ESCAPE: 'escape',
  DOWN: 'down',
};

export class NPC {
  constructor({ id, color, grid, scene, cellSize, mapSize, start }) {
    this.id = id;
    this.grid = grid;
    this.cellSize = cellSize;
    this.mapSize = mapSize;
    this.state = NPC_STATE.EXPLORE;
    this.speed = 1; // cells per second
    this.position = { ...start };
    this.worldPosition = this.toWorld(start);
    this.targetQueue = this.buildExplorationQueue();
    this.currentPath = [];
    this.pathProgress = 0;
    this.orientation = 0;
    this.fov = THREE.MathUtils.degToRad(70);
    this.viewDistance = 8;
    this.recognized = false;
    this.visibilityTimer = 0;
    this.lostTimer = 0;
    this.scanTimer = 0;
    this.scanStep = 0;
    this.lastSeenEnemy = null;
    this.currentGoal = { ...start };
    this.questionSprite = buildBillboard('?');
    this.questionSprite.visible = false;
    scene.add(this.questionSprite);

    const bodyGeo = new THREE.CylinderGeometry(cellSize * 0.25, cellSize * 0.32, cellSize * 0.8, 16);
    const bodyMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2 });
    this.mesh = new THREE.Mesh(bodyGeo, bodyMat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;

    const headGeo = new THREE.SphereGeometry(cellSize * 0.22, 18, 12);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x0f1118 });
    this.head = new THREE.Mesh(headGeo, headMat);
    this.head.position.y = cellSize * 0.6;
    this.mesh.add(this.head);

    const coneGeo = new THREE.ConeGeometry(this.viewDistance * cellSize * 0.2, this.viewDistance * cellSize * 0.6, 24, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({ color: 0x6ec1ff, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
    this.fovMesh = new THREE.Mesh(coneGeo, coneMat);
    this.fovMesh.position.y = cellSize * 0.4;
    this.mesh.add(this.fovMesh);

    this.mesh.position.set(this.worldPosition.x, cellSize * 0.4, this.worldPosition.z);
    scene.add(this.mesh);
  }

  toWorld(cell) {
    return gridCellCenter(cell.x, cell.y, this.cellSize, this.mapSize);
  }

  setPath(path) {
    this.currentPath = path;
    this.pathProgress = 0;
  }

  update(dt, enemy, navigator) {
    if (this.state === NPC_STATE.DOWN) return;
    const enemyVisible = this.canSee(enemy.position, navigator);

    if (enemyVisible) {
      this.visibilityTimer += dt;
      this.lostTimer = 0;
    } else {
      this.visibilityTimer = Math.max(0, this.visibilityTimer - dt * 0.5);
      this.lostTimer += dt;
    }

    const recognizedNow = this.visibilityTimer >= 2;
    if (recognizedNow) {
      this.recognized = true;
      this.lastSeenEnemy = { ...enemy.position };
      if (this.state !== NPC_STATE.ESCAPE) {
        this.state = NPC_STATE.CHASE;
      }
    }

    if (this.recognized && this.lostTimer >= 3) {
      this.recognized = false;
      this.state = NPC_STATE.LOST;
      this.currentGoal = this.lastSeenEnemy;
      this.setPath(navigator.pathTo(this.position, this.lastSeenEnemy));
      this.questionSprite.visible = false;
    }

    if (enemy.recognized && enemy.state === NPC_STATE.CHASE && this.canSee(enemy.position, navigator)) {
      this.state = NPC_STATE.ESCAPE;
      this.recognized = false;
      const escapePath = navigator.pathAwayFrom(this.position, enemy.position);
      this.currentGoal = escapePath[escapePath.length - 1] ?? this.position;
      this.setPath(escapePath);
    }

    switch (this.state) {
      case NPC_STATE.EXPLORE:
        this.handleExplore(dt, navigator);
        break;
      case NPC_STATE.SCAN:
        this.handleScan(dt);
        break;
      case NPC_STATE.CHASE:
      case NPC_STATE.FLANK:
        this.handleChase(dt, enemy, navigator);
        break;
      case NPC_STATE.LOST:
        this.handleLost(dt, navigator);
        break;
      case NPC_STATE.ESCAPE:
        this.handleEscape(dt, navigator);
        break;
    }

    this.syncMeshes();
  }

  handleExplore(dt, navigator) {
    if (!this.currentPath.length) {
      const next = this.targetQueue.shift();
      this.targetQueue.push(next);
      this.currentGoal = next;
      const path = navigator.pathTo(this.position, next);
      this.setPath(path);
    }
    const reached = this.followPath(dt);
    if (reached) {
      this.state = NPC_STATE.SCAN;
      this.scanTimer = 0;
      this.scanStep = 0;
    }
  }

  handleScan(dt) {
    const steps = [0, Math.PI / 2, -Math.PI / 2];
    if (this.scanStep >= steps.length) {
      this.state = NPC_STATE.EXPLORE;
      return;
    }
    this.scanTimer += dt;
    this.orientation += (steps[this.scanStep] - this.orientation) * 0.1;
    if (this.scanTimer >= 1) {
      this.scanStep += 1;
      this.scanTimer = 0;
    }
  }

  handleChase(dt, enemy, navigator) {
    if (this.recognized) {
      const flankOffset = offsetBehind(enemy.orientation);
      const goal = navigator.clampToFloor({ x: enemy.position.x + flankOffset.x, y: enemy.position.y + flankOffset.y });
      this.currentGoal = goal;
      const path = navigator.pathTo(this.position, goal);
      if (path.length) this.setPath(path);
      const reached = this.followPath(dt);
      if (reached) {
        this.state = NPC_STATE.FLANK;
      }
      if (this.isBehind(enemy)) {
        enemy.state = NPC_STATE.DOWN;
      }
    } else {
      this.state = NPC_STATE.EXPLORE;
    }
  }

  handleLost(dt, navigator) {
    this.questionSprite.visible = true;
    const reached = this.followPath(dt);
    if (reached) {
      this.scanTimer += dt;
      const steps = [0, Math.PI / 2, -Math.PI / 2];
      this.orientation += (steps[this.scanStep] - this.orientation) * 0.1;
      if (this.scanTimer >= 1) {
        this.scanStep += 1;
        this.scanTimer = 0;
      }
      if (this.scanStep >= steps.length) {
        this.questionSprite.visible = false;
        this.state = NPC_STATE.EXPLORE;
      }
    }
  }

  handleEscape(dt, navigator) {
    const reached = this.followPath(dt);
    if (reached) {
      this.state = NPC_STATE.EXPLORE;
    }
  }

  followPath(dt) {
    if (!this.currentPath.length) return true;
    const nextCell = this.currentPath[this.pathProgress + 1];
    if (!nextCell) return true;
    const currentWorld = this.toWorld(this.currentPath[this.pathProgress]);
    const nextWorld = this.toWorld(nextCell);
    const dir = new THREE.Vector2(nextWorld.x - currentWorld.x, nextWorld.z - currentWorld.z);
    const worldPos = new THREE.Vector2(this.worldPosition.x, this.worldPosition.z);
    const distanceToNext = worldPos.distanceTo(new THREE.Vector2(nextWorld.x, nextWorld.z));
    const movePerFrame = Math.min(this.speed * this.cellSize * dt, distanceToNext);
    dir.normalize();
    worldPos.addScaledVector(dir, movePerFrame);
    this.worldPosition.x = worldPos.x;
    this.worldPosition.z = worldPos.y;
    this.orientation = Math.atan2(dir.x, dir.y);

    if (worldPos.distanceTo(new THREE.Vector2(nextWorld.x, nextWorld.z)) < 0.05) {
      this.pathProgress += 1;
      this.position = { ...nextCell };
      if (this.pathProgress >= this.currentPath.length - 1) {
        this.currentPath = [];
        return true;
      }
    }

    return false;
  }

  syncMeshes() {
    this.mesh.position.set(this.worldPosition.x, this.cellSize * 0.4, this.worldPosition.z);
    this.mesh.rotation.y = this.orientation;
    this.fovMesh.rotation.x = -Math.PI / 2;
    this.questionSprite.position.set(this.worldPosition.x, this.cellSize * 1.4, this.worldPosition.z);
  }

  buildExplorationQueue() {
    const queue = [];
    for (let y = 1; y < this.grid.length; y++) {
      for (let x = 1; x < this.grid.length; x++) {
        if (this.grid[y][x] !== CELL_WALL) queue.push({ x, y });
      }
    }
    return queue.sort(() => Math.random() - 0.5);
  }

  canSee(target, navigator) {
    const delta = { x: target.x - this.position.x, y: target.y - this.position.y };
    const distance = Math.hypot(delta.x, delta.y);
    if (distance > this.viewDistance) return false;

    const angle = Math.atan2(delta.x, delta.y);
    let diff = angle - this.orientation;
    diff = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (Math.abs(diff) > this.fov / 2) return false;

    return navigator.lineOfSight(this.position, target);
  }

  isBehind(enemy) {
    const delta = { x: enemy.position.x - this.position.x, y: enemy.position.y - this.position.y };
    const distance = Math.hypot(delta.x, delta.y);
    if (distance > 1) return false;
    const enemyBack = enemy.orientation + Math.PI;
    let angleToUs = Math.atan2(this.position.x - enemy.position.x, this.position.y - enemy.position.y);
    let diff = angleToUs - enemyBack;
    diff = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI;
    return Math.abs(diff) < Math.PI / 3;
  }
}

function buildBillboard(text) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#ffd166';
  ctx.font = '96px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.2, 1.2, 1.2);
  return sprite;
}

function offsetBehind(angle) {
  return { x: -Math.sin(angle), y: -Math.cos(angle) };
}
