import { CELL_WALL } from './maze.js';

export function astar(grid, start, goal) {
  const size = grid.length;
  const key = (p) => `${p.x},${p.y}`;
  const open = new Map();
  const closed = new Set();
  const startKey = key(start);
  open.set(startKey, { ...start, g: 0, f: heuristic(start, goal), parent: null });

  const neighbors = (
    x,
    y,
  ) =>
    [
      { x: x + 1, y },
      { x: x - 1, y },
      { x, y: y + 1 },
      { x, y: y - 1 },
    ].filter((p) => p.x >= 0 && p.y >= 0 && p.x < size && p.y < size && grid[p.y][p.x] !== CELL_WALL);

  while (open.size) {
    let currentKey;
    let currentNode;
    for (const [k, node] of open.entries()) {
      if (!currentNode || node.f < currentNode.f) {
        currentKey = k;
        currentNode = node;
      }
    }

    if (!currentNode) break;
    open.delete(currentKey);
    closed.add(currentKey);

    if (currentNode.x === goal.x && currentNode.y === goal.y) {
      return reconstruct(currentNode);
    }

    for (const n of neighbors(currentNode.x, currentNode.y)) {
      const nk = key(n);
      if (closed.has(nk)) continue;
      const g = currentNode.g + 1;
      const existing = open.get(nk);
      if (!existing || g < existing.g) {
        open.set(nk, { ...n, g, f: g + heuristic(n, goal), parent: currentNode });
      }
    }
  }

  return [];
}

function heuristic(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function reconstruct(node) {
  const path = [];
  let current = node;
  while (current) {
    path.push({ x: current.x, y: current.y });
    current = current.parent;
  }
  return path.reverse();
}
