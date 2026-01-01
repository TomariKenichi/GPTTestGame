export const CELL_WALL = 1;
export const CELL_FLOOR = 0;

function neighbors(x, y, size) {
  return [
    [x + 2, y],
    [x - 2, y],
    [x, y + 2],
    [x, y - 2],
  ].filter(([nx, ny]) => nx > 0 && ny > 0 && nx < size - 1 && ny < size - 1);
}

export function generateStealthMaze(size = 32) {
  const grid = Array.from({ length: size }, () => Array(size).fill(CELL_WALL));
  const stack = [[1, 1]];
  grid[1][1] = CELL_FLOOR;

  while (stack.length) {
    const current = stack[stack.length - 1];
    const [x, y] = current;
    const n = neighbors(x, y, size).filter(([nx, ny]) => grid[ny][nx] === CELL_WALL);
    if (n.length === 0) {
      stack.pop();
      continue;
    }
    const [nx, ny] = n[Math.floor(Math.random() * n.length)];
    const mx = x + (nx - x) / 2;
    const my = y + (ny - y) / 2;
    grid[my][mx] = CELL_FLOOR;
    grid[ny][nx] = CELL_FLOOR;
    stack.push([nx, ny]);
  }

  // Add stealth friendly pockets and alternate routes
  for (let i = 0; i < size * 2; i++) {
    const x = 1 + Math.floor(Math.random() * (size - 2));
    const y = 1 + Math.floor(Math.random() * (size - 2));
    if (grid[y][x] === CELL_WALL) {
      const adjacentFloors = neighbors(x, y, size).filter(([nx, ny]) => grid[ny][nx] === CELL_FLOOR);
      if (adjacentFloors.length >= 2) {
        grid[y][x] = CELL_FLOOR;
      }
    }
  }

  // Random cover blocks (pillars) without blocking corridors entirely
  for (let i = 0; i < size * 3; i++) {
    const x = 1 + Math.floor(Math.random() * (size - 2));
    const y = 1 + Math.floor(Math.random() * (size - 2));
    if (grid[y][x] === CELL_FLOOR) {
      const adjCount = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].reduce((acc, [dx, dy]) => acc + (grid[y + dy]?.[x + dx] === CELL_FLOOR ? 1 : 0), 0);
      if (adjCount >= 2 && Math.random() < 0.3) {
        grid[y][x] = CELL_WALL; // cover
      }
    }
  }

  return grid;
}

export function gridCellCenter(x, y, cellSize, mapSize) {
  const offset = (mapSize * cellSize) / 2;
  return { x: x * cellSize - offset + cellSize / 2, z: y * cellSize - offset + cellSize / 2 };
}
