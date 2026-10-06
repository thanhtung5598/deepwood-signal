// Ports: north=1, east=2, south=4, west=8. Both adjacent ports must match.
const NORTH = 1;
const EAST = 2;
const SOUTH = 4;
const WEST = 8;
const SOURCE = 3;
const CORE = 5;
const ROUTES = [
  [3, 0, 1, 2, 5],
  [3, 4, 1, 2, 5],
  [3, 6, 7, 8, 5],
  [3, 0, 1, 4, 7, 8, 5],
  [3, 6, 7, 4, 1, 2, 5],
];
const SHAPES = [NORTH | SOUTH, EAST | WEST, NORTH | EAST, EAST | SOUTH, SOUTH | WEST, WEST | NORTH];

function clockwise(ports) {
  return ((ports << 1) & 15) | (ports >> 3);
}

function toward(from, to) {
  if (to === from - 3) return NORTH;
  if (to === from + 3) return SOUTH;
  if (to === from + 1) return EAST;
  return WEST;
}

function power(tiles) {
  const powered = new Set();
  if (!(tiles[SOURCE].ports & WEST)) return powered;
  const queue = [SOURCE];
  powered.add(SOURCE);
  while (queue.length) {
    const index = queue.shift();
    const row = Math.floor(index / 3);
    const column = index % 3;
    for (const [port, opposite, neighbor, valid] of [
      [NORTH, SOUTH, index - 3, row > 0],
      [EAST, WEST, index + 1, column < 2],
      [SOUTH, NORTH, index + 3, row < 2],
      [WEST, EAST, index - 1, column > 0],
    ]) {
      if (!valid || powered.has(neighbor) || !(tiles[index].ports & port) || !(tiles[neighbor].ports & opposite)) continue;
      powered.add(neighbor);
      queue.push(neighbor);
    }
  }
  return powered;
}

export function createEnergyCircuit({ random = Math.random } = {}) {
  const duration = 15;
  const choose = (count) => Math.min(count - 1, Math.floor(random() * count));
  const route = ROUTES[choose(ROUTES.length)];
  const tiles = Array.from({ length: 9 }, () => ({ basePorts: SHAPES[choose(SHAPES.length)], turns: 0, ports: 0 }));
  route.forEach((index, position) => {
    const incoming = position === 0 ? WEST : toward(index, route[position - 1]);
    const outgoing = position === route.length - 1 ? EAST : toward(index, route[position + 1]);
    tiles[index].basePorts = incoming | outgoing;
  });
  // Scramble a guaranteed route, including every useful tile. Straight pipes
  // turn an odd number of times so their equivalent 180-degree shape is avoided.
  for (const tile of tiles) {
    const straight = tile.basePorts === 5 || tile.basePorts === 10;
    tile.turns = straight ? 1 + choose(2) * 2 : 1 + choose(3);
    tile.ports = tile.basePorts;
    for (let turn = 0; turn < tile.turns; turn++) tile.ports = clockwise(tile.ports);
  }
  // Keep the source disconnected initially, even if decorative tiles happen
  // to create an alternative path through the scrambled board.
  while (tiles[SOURCE].ports & WEST) {
    tiles[SOURCE].turns += 1;
    tiles[SOURCE].ports = clockwise(tiles[SOURCE].ports);
  }
  let elapsed = 0;
  let status = "active";
  let energized = power(tiles);

  function snapshot() {
    return {
      status,
      remaining: Math.max(0, duration - elapsed),
      heat: status === "success" ? 0.15 : status === "failed" ? 1 : 0.25 + elapsed / duration * 0.75,
      sourcePowered: energized.has(SOURCE),
      tiles: tiles.map((tile, index) => ({ ...tile, powered: energized.has(index) })),
    };
  }

  return {
    snapshot,
    advance(seconds) {
      if (status !== "active") return snapshot();
      elapsed = Math.min(duration, elapsed + Math.max(0, seconds));
      if (elapsed >= duration) status = "failed";
      return snapshot();
    },
    rotate(index) {
      if (status !== "active" || !Number.isInteger(index) || index < 0 || index >= tiles.length) return false;
      const tile = tiles[index];
      tile.turns += 1;
      tile.ports = clockwise(tile.ports);
      energized = power(tiles);
      if (energized.has(CORE) && (tiles[CORE].ports & EAST)) status = "success";
      return true;
    },
  };
}
