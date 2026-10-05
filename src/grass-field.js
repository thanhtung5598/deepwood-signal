import * as THREE from "three/webgpu";
import {
  Fn,
  attribute,
  color,
  cos,
  mix,
  positionLocal,
  sin,
  uniform,
  uv,
  vec3,
} from "three/tsl";
import { pathCenterX, terrainHeight } from "./lessons/lesson-10.js";

const TILE_GRID = 11;
const LOW_QUALITY_BLADE_COUNT = 54100;
const TWO_PI = Math.PI * 2;

function mulberry32(seed) {
  return function random() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createBladeGeometry(segments) {
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let segment = 0; segment <= segments; segment += 1) {
    const amount = segment / segments;
    const halfWidth = 0.055 * Math.pow(1 - amount, 0.72) + 0.003;
    const height = amount * 0.72;
    const curve = amount * amount * 0.075;
    positions.push(-halfWidth, height, curve, halfWidth, height, curve);
    uvs.push(0, amount, 1, amount);

    if (segment < segments) {
      const start = segment * 2;
      indices.push(
        start,
        start + 1,
        start + 2,
        start + 1,
        start + 3,
        start + 2,
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createGrassMaterial(windTime, weatherTint, weatherMix, lod) {
  const material = new THREE.MeshStandardNodeMaterial({
    side: THREE.DoubleSide,
    roughness: 0.94,
    metalness: 0,
  });
  material.name = `grass-lod-${lod}`;

  const offset = attribute("bladeOffset", "vec3");
  const scale = attribute("bladeScale", "vec2");
  const rotation = attribute("bladeRotation", "float");
  const phase = attribute("bladePhase", "float");
  const variation = attribute("bladeVariation", "float");

  material.positionNode = Fn(() => {
    const heightAmount = uv().y;
    const local = positionLocal.toVar();
    const scaledX = local.x.mul(scale.x);
    const scaledY = local.y.mul(scale.y);
    const wave = sin(
      windTime
        .mul(1.55)
        .add(phase)
        .add(offset.x.mul(0.075))
        .add(offset.z.mul(0.052)),
    );
    const gust = sin(
      windTime
        .mul(0.47)
        .add(offset.x.mul(0.026))
        .sub(offset.z.mul(0.031)),
    );
    const bendWeight = heightAmount.mul(heightAmount);
    const bend = wave.mul(0.12).add(gust.mul(0.07)).mul(bendWeight);
    const curve = local.z.mul(scale.y).add(bend);
    const rotationCos = cos(rotation);
    const rotationSin = sin(rotation);
    const rotatedX = scaledX.mul(rotationCos).sub(curve.mul(rotationSin));
    const rotatedZ = scaledX.mul(rotationSin).add(curve.mul(rotationCos));

    return vec3(
      rotatedX.add(offset.x),
      scaledY.add(offset.y),
      rotatedZ.add(offset.z),
    );
  })();

  const rootColor = color("#29482d");
  const middleColor = color("#52723b");
  const tipColor = color("#819254");
  const heightColor = mix(rootColor, middleColor, uv().y.mul(1.7).clamp(0, 1));
  const grassColor = mix(heightColor, tipColor, uv().y.mul(0.72)).mul(
    variation.mul(0.3).add(0.84),
  );
  material.colorNode = mix(grassColor, weatherTint, weatherMix);

  return material;
}

function createTileGeometry(baseGeometry, placements, density, tileRadius) {
  const count = Math.ceil(placements.length * density);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex(baseGeometry.index);
  geometry.setAttribute("position", baseGeometry.attributes.position);
  geometry.setAttribute("normal", baseGeometry.attributes.normal);
  geometry.setAttribute("uv", baseGeometry.attributes.uv);

  const offsets = new Float32Array(count * 3);
  const scales = new Float32Array(count * 2);
  const rotations = new Float32Array(count);
  const phases = new Float32Array(count);
  const variations = new Float32Array(count);

  for (let targetIndex = 0; targetIndex < count; targetIndex += 1) {
    const sourceIndex = Math.min(
      placements.length - 1,
      Math.floor(targetIndex / density),
    );
    const placement = placements[sourceIndex];
    offsets[targetIndex * 3] = placement.x;
    offsets[targetIndex * 3 + 1] = placement.y;
    offsets[targetIndex * 3 + 2] = placement.z;
    scales[targetIndex * 2] = placement.width;
    scales[targetIndex * 2 + 1] = placement.height;
    rotations[targetIndex] = placement.rotation;
    phases[targetIndex] = placement.phase;
    variations[targetIndex] = placement.variation;
  }

  geometry.setAttribute(
    "bladeOffset",
    new THREE.InstancedBufferAttribute(offsets, 3),
  );
  geometry.setAttribute(
    "bladeScale",
    new THREE.InstancedBufferAttribute(scales, 2),
  );
  geometry.setAttribute(
    "bladeRotation",
    new THREE.InstancedBufferAttribute(rotations, 1),
  );
  geometry.setAttribute(
    "bladePhase",
    new THREE.InstancedBufferAttribute(phases, 1),
  );
  geometry.setAttribute(
    "bladeVariation",
    new THREE.InstancedBufferAttribute(variations, 1),
  );
  geometry.instanceCount = count;
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, 0.7, 0),
    tileRadius,
  );
  return geometry;
}

function createTilePlacements(random, count, tileSize, centerX, centerZ) {
  const placements = [];
  let attempts = 0;
  const maximumAttempts = count * 30;

  while (placements.length < count && attempts < maximumAttempts) {
    attempts += 1;
    const localX = (random() - 0.5) * tileSize;
    const localZ = (random() - 0.5) * tileSize;
    const worldX = centerX + localX;
    const worldZ = centerZ + localZ;
    if (Math.abs(worldX - pathCenterX(worldZ)) < 1.7) continue;

    const patchNoise =
      Math.sin(worldX * 0.17 + Math.cos(worldZ * 0.11) * 2.1) * 0.5 + 0.5;
    if (random() > 0.48 + patchNoise * 0.5) continue;

    placements.push({
      x: localX,
      y: terrainHeight(worldX, worldZ) + 0.012,
      z: localZ,
      width: 0.72 + random() * 0.62,
      height: 0.68 + random() * 0.82,
      rotation: random() * TWO_PI,
      phase: random() * TWO_PI,
      variation: random(),
    });
  }

  // Các tile cắt ngang đường mòn có ít diện tích hợp lệ hơn. Bổ sung đủ số
  // instance bằng placement tự do để tổng Quality Low luôn xấp xỉ 54.100 lá.
  while (placements.length < count) {
    const localX = (random() - 0.5) * tileSize;
    const localZ = (random() - 0.5) * tileSize;
    const worldX = centerX + localX;
    const worldZ = centerZ + localZ;
    placements.push({
      x: localX,
      y: terrainHeight(worldX, worldZ) + 0.012,
      z: localZ,
      width: 0.72 + random() * 0.62,
      height: 0.68 + random() * 0.82,
      rotation: random() * TWO_PI,
      phase: random() * TWO_PI,
      variation: random(),
    });
  }

  return placements;
}

export function createProceduralGrassField({ worldSize = 160, seed = 8017 } = {}) {
  const group = new THREE.Group();
  group.name = "procedural-grass-field";
  const tileSize = worldSize / TILE_GRID;
  const tileRadius = Math.hypot(tileSize, tileSize) * 0.5 + 1.6;
  const random = mulberry32(seed);
  const windTime = uniform(0);
  const weatherTint = uniform(new THREE.Color("#ffffff"));
  const weatherMix = uniform(0);
  const bladeGeometries = [
    createBladeGeometry(5),
    createBladeGeometry(3),
    createBladeGeometry(1),
  ];
  const materials = [0, 1, 2].map((lod) =>
    createGrassMaterial(windTime, weatherTint, weatherMix, lod),
  );
  const tiles = [];
  const tileDefinitions = [];
  let totalBlades = 0;

  for (let tileZ = 0; tileZ < TILE_GRID; tileZ += 1) {
    for (let tileX = 0; tileX < TILE_GRID; tileX += 1) {
      const centerX = -worldSize * 0.5 + (tileX + 0.5) * tileSize;
      const centerZ = -worldSize * 0.5 + (tileZ + 0.5) * tileSize;
      const centerDistance = Math.hypot(centerX, centerZ);
      const trailDistance = Math.abs(centerX - pathCenterX(centerZ));
      const centerWeight = Math.exp(-(centerDistance * centerDistance) / 3200);
      const trailWeight = Math.exp(-(trailDistance * trailDistance) / 520);
      tileDefinitions.push({
        tileX,
        tileZ,
        centerX,
        centerZ,
        weight: 0.22 + centerWeight * 1.65 + trailWeight * 0.52,
      });
    }
  }

  const totalWeight = tileDefinitions.reduce((sum, tile) => sum + tile.weight, 0);
  let allocatedBlades = 0;
  tileDefinitions.forEach((tile) => {
    const exactCount = (LOW_QUALITY_BLADE_COUNT * tile.weight) / totalWeight;
    tile.count = Math.floor(exactCount);
    tile.fraction = exactCount - tile.count;
    allocatedBlades += tile.count;
  });
  tileDefinitions
    .slice()
    .sort((a, b) => b.fraction - a.fraction)
    .slice(0, LOW_QUALITY_BLADE_COUNT - allocatedBlades)
    .forEach((tile) => {
      tile.count += 1;
    });

  for (const definition of tileDefinitions) {
    const { tileX, tileZ, centerX, centerZ, count } = definition;
    const placements = createTilePlacements(
      random,
      count,
      tileSize,
      centerX,
      centerZ,
    );
    const tile = new THREE.Group();
    tile.name = `grass-tile-${tileX}-${tileZ}`;
    tile.position.set(centerX, 0, centerZ);
    const densities = [1, 1, 0.8];
    const meshes = densities.map((density, lod) => {
      const geometry = createTileGeometry(
        bladeGeometries[lod],
        placements,
        density,
        tileRadius,
      );
      const mesh = new THREE.Mesh(geometry, materials[lod]);
      mesh.name = `grass-tile-${tileX}-${tileZ}-lod-${lod}`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      mesh.visible = false;
      tile.add(mesh);
      return mesh;
    });
    group.add(tile);
    tiles.push({ centerX, centerZ, meshes });
    totalBlades += count;
  }

  let lodElapsed = Infinity;
  const stats = {
    totalBlades,
    totalTiles: tiles.length,
    activeBlades: 0,
    activeTiles: 0,
  };

  group.userData.stats = stats;
  group.userData.setWeatherTint = (value, amount = 0) => {
    weatherTint.value.set(value);
    weatherMix.value = THREE.MathUtils.clamp(amount, 0, 1);
  };
  group.userData.update = (deltaTime, elapsedTime, playerPosition, force = false) => {
    windTime.value = elapsedTime;
    lodElapsed += deltaTime;
    if (!force && lodElapsed < 0.16) return;
    lodElapsed = 0;
    stats.activeBlades = 0;
    stats.activeTiles = 0;

    for (const tile of tiles) {
      const distance = Math.hypot(
        playerPosition.x - tile.centerX,
        playerPosition.z - tile.centerZ,
      );
      const lod = distance < 24 ? 0 : distance < 46 ? 1 : distance < 85 ? 2 : -1;
      tile.meshes.forEach((mesh, index) => {
        mesh.visible = index === lod;
      });
      if (lod >= 0) {
        stats.activeTiles += 1;
        stats.activeBlades += tile.meshes[lod].geometry.instanceCount;
      }
    }
  };

  group.userData.dispose = () => {
    group.traverse((object) => {
      if (object.isMesh) object.geometry.dispose();
    });
    bladeGeometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  };

  return group;
}
