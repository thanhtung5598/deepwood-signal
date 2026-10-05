import * as THREE from "three/webgpu";
import {
  Fn,
  abs,
  attribute,
  color,
  cos,
  exp,
  mix,
  positionLocal,
  sin,
  uniform,
  vec3,
} from "three/tsl";
import { pathCenterX, terrainHeight } from "./lessons/lesson-10.js";

const TWO_PI = Math.PI * 2;

function mulberry32(seed) {
  return function random() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createTerrainMaterial() {
  const material = new THREE.MeshStandardNodeMaterial({
    roughness: 0.94,
    metalness: 0,
  });
  material.name = "procedural-terrain-material";

  material.colorNode = Fn(() => {
    const x = positionLocal.x;
    const z = positionLocal.z;
    const height = positionLocal.y;
    const pathCenter = sin(z.mul(0.105))
      .mul(2.6)
      .add(sin(z.mul(0.035)).mul(1.4));
    const pathDistance = abs(x.sub(pathCenter));
    const pathBlend = exp(pathDistance.mul(pathDistance).mul(-0.2)).mul(0.78);

    const broadVariation = sin(x.mul(0.17).add(z.mul(0.11)))
      .mul(0.055)
      .add(cos(x.mul(0.047).sub(z.mul(0.083))).mul(0.045));
    const heightBlend = height.add(2.4).mul(0.19).clamp(0, 1);
    const lowGrass = color("#405f35");
    const highGrass = color("#728454");
    const grassColor = mix(lowGrass, highGrass, heightBlend)
      .mul(broadVariation.add(0.96));
    const soilColor = color("#705e42").mul(
      sin(x.mul(0.41).add(z.mul(0.37))).mul(0.035).add(0.94),
    );

    return mix(grassColor, soilColor, pathBlend);
  })();

  material.roughnessNode = Fn(() => {
    const pathCenter = sin(positionLocal.z.mul(0.105))
      .mul(2.6)
      .add(sin(positionLocal.z.mul(0.035)).mul(1.4));
    const pathDistance = abs(positionLocal.x.sub(pathCenter));
    const pathBlend = exp(pathDistance.mul(pathDistance).mul(-0.2));
    return mix(0.96, 0.88, pathBlend);
  })();

  return material;
}

export function createProceduralTerrain({ worldSize = 160, segments = 256 } = {}) {
  const geometry = new THREE.PlaneGeometry(
    worldSize,
    worldSize,
    segments,
    segments,
  );
  geometry.rotateX(-Math.PI / 2);

  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    positions.setY(index, terrainHeight(x, z));
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const terrain = new THREE.Mesh(geometry, createTerrainMaterial());
  terrain.name = "procedural-terrain-256";
  terrain.receiveShadow = true;
  terrain.frustumCulled = false;
  terrain.userData.stats = {
    segments,
    vertices: positions.count,
  };
  return terrain;
}

function pushQuad(positions, parts, indices, points, part) {
  const start = positions.length / 3;
  for (const point of points) {
    positions.push(point[0], point[1], point[2]);
    parts.push(part);
  }
  indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
}

function createFlowerGeometry() {
  const positions = [];
  const parts = [];
  const indices = [];

  pushQuad(
    positions,
    parts,
    indices,
    [
      [-0.018, 0, 0],
      [0.018, 0, 0],
      [0.018, 0.51, 0],
      [-0.018, 0.51, 0],
    ],
    0,
  );
  pushQuad(
    positions,
    parts,
    indices,
    [
      [0, 0, -0.018],
      [0, 0, 0.018],
      [0, 0.51, 0.018],
      [0, 0.51, -0.018],
    ],
    0,
  );

  for (let petal = 0; petal < 6; petal += 1) {
    const angle = (petal / 6) * TWO_PI;
    const point = (radius, angleOffset, y) => [
      Math.cos(angle + angleOffset) * radius,
      y,
      Math.sin(angle + angleOffset) * radius,
    ];
    pushQuad(
      positions,
      parts,
      indices,
      [
        point(0.025, 0, 0.515),
        point(0.105, -0.42, 0.526),
        point(0.205, 0, 0.545),
        point(0.105, 0.42, 0.526),
      ],
      1,
    );
  }

  pushQuad(
    positions,
    parts,
    indices,
    [
      [-0.052, 0.49, 0],
      [0.052, 0.49, 0],
      [0.052, 0.59, 0],
      [-0.052, 0.59, 0],
    ],
    2,
  );
  pushQuad(
    positions,
    parts,
    indices,
    [
      [0, 0.49, -0.052],
      [0, 0.49, 0.052],
      [0, 0.59, 0.052],
      [0, 0.59, -0.052],
    ],
    2,
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute(
    "flowerPart",
    new THREE.Float32BufferAttribute(parts, 1),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createFlowerMaterial(time) {
  const material = new THREE.MeshStandardNodeMaterial({
    side: THREE.DoubleSide,
    roughness: 0.82,
    metalness: 0,
  });
  material.name = "procedural-flower-material";

  const home = attribute("flowerHome", "vec3");
  const scale = attribute("flowerScale", "float");
  const yaw = attribute("flowerYaw", "float");
  const phase = attribute("flowerPhase", "float");
  const part = attribute("flowerPart", "float");
  const flowerColor = attribute("flowerColor", "vec3");

  material.positionNode = Fn(() => {
    const local = positionLocal.mul(scale);
    const rotationCos = cos(yaw);
    const rotationSin = sin(yaw);
    const rotatedX = local.x.mul(rotationCos).sub(local.z.mul(rotationSin));
    const rotatedZ = local.x.mul(rotationSin).add(local.z.mul(rotationCos));
    const bendWeight = positionLocal.y.mul(1.85).clamp(0, 1);
    const wind = sin(
      time
        .mul(1.38)
        .add(phase)
        .add(home.x.mul(0.075))
        .add(home.z.mul(0.052)),
    );
    const crossWind = sin(time.mul(0.82).add(phase.mul(1.73)));

    return vec3(
      home.x.add(rotatedX).add(wind.mul(0.075).mul(bendWeight)),
      home.y.add(local.y),
      home.z.add(rotatedZ).add(crossWind.mul(0.048).mul(bendWeight)),
    );
  })();

  const petalBlend = part.clamp(0, 1);
  const centerBlend = part.sub(1).clamp(0, 1);
  const stemToPetal = mix(color("#31552e"), flowerColor, petalBlend);
  material.colorNode = mix(stemToPetal, color("#f5c84a"), centerBlend);
  return material;
}

function createScatteredFlowerPlacements(
  random,
  count,
  worldSize,
  avoidX,
  avoidZ,
) {
  const gridSize = Math.ceil(Math.sqrt(count * 1.2));
  const cellSize = worldSize / gridSize;
  const halfWorld = worldSize * 0.5;
  const candidates = [];

  // Một ứng viên trên mỗi ô với jitter ngẫu nhiên tạo khoảng cách tự nhiên
  // giữa các bông, thay vì sinh nhiều điểm quanh cùng một tâm thành từng chùm.
  for (let gridZ = 0; gridZ < gridSize; gridZ += 1) {
    for (let gridX = 0; gridX < gridSize; gridX += 1) {
      const x = -halfWorld
        + (gridX + 0.5) * cellSize
        + (random() - 0.5) * cellSize * 0.54;
      const z = -halfWorld
        + (gridZ + 0.5) * cellSize
        + (random() - 0.5) * cellSize * 0.54;
      if (Math.abs(x - pathCenterX(z)) < 2.1) continue;
      if (Math.hypot(x - avoidX, z - avoidZ) < 4.8) continue;
      candidates.push({ x, z });
    }
  }

  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [candidates[index], candidates[swapIndex]] = [
      candidates[swapIndex],
      candidates[index],
    ];
  }
  return candidates.slice(0, count);
}

export function createFlowerGarden({
  worldSize = 160,
  avoidX = 0,
  avoidZ = 0,
  count = 2250,
  seed = 4813,
} = {}) {
  const random = mulberry32(seed);
  const time = uniform(0);
  const baseGeometry = createFlowerGeometry();
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex(baseGeometry.index);
  geometry.setAttribute("position", baseGeometry.attributes.position);
  geometry.setAttribute("normal", baseGeometry.attributes.normal);
  geometry.setAttribute("flowerPart", baseGeometry.attributes.flowerPart);

  const homes = new Float32Array(count * 3);
  const scales = new Float32Array(count);
  const yaws = new Float32Array(count);
  const phases = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const palette = [
    new THREE.Color("#f2cf63"),
    new THREE.Color("#f58ca8"),
    new THREE.Color("#a99bea"),
    new THREE.Color("#f0eee0"),
    new THREE.Color("#e98c5c"),
  ];

  const placements = createScatteredFlowerPlacements(
    random,
    count,
    worldSize,
    avoidX,
    avoidZ,
  );
  geometry.instanceCount = placements.length;

  for (let index = 0; index < placements.length; index += 1) {
    const placement = placements[index];
    homes[index * 3] = placement.x;
    homes[index * 3 + 1] = terrainHeight(placement.x, placement.z) + 0.018;
    homes[index * 3 + 2] = placement.z;
    scales[index] = 0.62 + random() * 0.72;
    yaws[index] = random() * TWO_PI;
    phases[index] = random() * TWO_PI;
    palette[Math.floor(random() * palette.length)].toArray(colors, index * 3);
  }

  geometry.setAttribute("flowerHome", new THREE.InstancedBufferAttribute(homes, 3));
  geometry.setAttribute("flowerScale", new THREE.InstancedBufferAttribute(scales, 1));
  geometry.setAttribute("flowerYaw", new THREE.InstancedBufferAttribute(yaws, 1));
  geometry.setAttribute("flowerPhase", new THREE.InstancedBufferAttribute(phases, 1));
  geometry.setAttribute("flowerColor", new THREE.InstancedBufferAttribute(colors, 3));
  geometry.instanceCount = placements.length;
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, 0.8, 0),
    Math.hypot(worldSize * 0.5, worldSize * 0.5) + 3,
  );

  const flowers = new THREE.Mesh(geometry, createFlowerMaterial(time));
  flowers.name = "procedural-scattered-flowers";
  flowers.castShadow = false;
  flowers.receiveShadow = false;
  flowers.frustumCulled = true;
  flowers.userData.stats = { count: placements.length, drawCalls: 1 };
  flowers.userData.update = (_deltaTime, elapsedTime) => {
    time.value = elapsedTime;
  };
  flowers.userData.dispose = () => {
    geometry.dispose();
    flowers.material.dispose();
    baseGeometry.dispose();
  };
  return flowers;
}

function createButterflyGeometry() {
  const positions = [];
  const parts = [];
  const indices = [];
  pushQuad(
    positions,
    parts,
    indices,
    [
      [-0.018, 0, -0.035],
      [-0.34, 0, -0.19],
      [-0.29, 0, 0.18],
      [-0.018, 0, 0.07],
    ],
    0,
  );
  pushQuad(
    positions,
    parts,
    indices,
    [
      [0.018, 0, 0.07],
      [0.29, 0, 0.18],
      [0.34, 0, -0.19],
      [0.018, 0, -0.035],
    ],
    0,
  );
  pushQuad(
    positions,
    parts,
    indices,
    [
      [-0.025, -0.018, -0.19],
      [0.025, -0.018, -0.19],
      [0.025, 0.018, 0.18],
      [-0.025, 0.018, 0.18],
    ],
    1,
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("butterflyPart", new THREE.Float32BufferAttribute(parts, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createButterflyMaterial(time) {
  const material = new THREE.MeshBasicNodeMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  material.name = "procedural-butterfly-material";

  const home = attribute("butterflyHome", "vec3");
  const seed = attribute("butterflySeed", "vec4");
  const part = attribute("butterflyPart", "float");
  const wingColor = attribute("butterflyColor", "vec3");

  material.positionNode = Fn(() => {
    const phase = seed.y.mul(TWO_PI);
    const flightTime = time.mul(seed.x.mul(0.18).add(0.36)).add(phase);
    const orbitX = sin(flightTime).mul(seed.z.mul(2.1).add(1.5));
    const orbitZ = cos(flightTime.mul(0.82).add(seed.w.mul(2.4)))
      .mul(seed.z.mul(1.6).add(1.2));
    const bob = sin(time.mul(1.45).add(phase)).mul(0.32);

    const flap = sin(time.mul(seed.x.mul(4).add(8.5)).add(phase))
      .mul(seed.z.mul(0.3).add(0.72));
    const bodyMask = part.clamp(0, 1);
    const wingMask = bodyMask.oneMinus();
    const localScale = seed.w.mul(0.25).add(0.38);
    const localX = positionLocal.x
      .mul(cos(flap).mul(wingMask).add(bodyMask))
      .mul(localScale);
    const localY = positionLocal.y
      .add(abs(positionLocal.x).mul(sin(flap)).mul(wingMask))
      .mul(localScale);
    const localZ = positionLocal.z.mul(localScale);
    const heading = flightTime.add(1.15);
    const headingCos = cos(heading);
    const headingSin = sin(heading);
    const rotatedX = localX.mul(headingCos).sub(localZ.mul(headingSin));
    const rotatedZ = localX.mul(headingSin).add(localZ.mul(headingCos));

    return vec3(
      home.x.add(orbitX).add(rotatedX),
      home.y.add(bob).add(localY),
      home.z.add(orbitZ).add(rotatedZ),
    );
  })();

  material.colorNode = mix(wingColor, color("#211b18"), part.clamp(0, 1));
  return material;
}

export function createButterflyField({
  centerX = 0,
  centerZ = 0,
  radius = 15,
  count = 24,
  seed = 9281,
} = {}) {
  const random = mulberry32(seed);
  const time = uniform(0);
  const baseGeometry = createButterflyGeometry();
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex(baseGeometry.index);
  geometry.setAttribute("position", baseGeometry.attributes.position);
  geometry.setAttribute("normal", baseGeometry.attributes.normal);
  geometry.setAttribute("butterflyPart", baseGeometry.attributes.butterflyPart);

  const homes = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);
  const colors = new Float32Array(count * 3);
  const palette = [
    new THREE.Color("#efca54"),
    new THREE.Color("#f28773"),
    new THREE.Color("#7ccad1"),
    new THREE.Color("#c5a4ef"),
  ];

  for (let index = 0; index < count; index += 1) {
    const angle = random() * TWO_PI;
    const distance = 4.5 + Math.sqrt(random()) * (radius - 4.5);
    const x = centerX + Math.cos(angle) * distance;
    const z = centerZ + Math.sin(angle) * distance;
    homes[index * 3] = x;
    homes[index * 3 + 1] = terrainHeight(x, z) + 1.05 + random() * 1.35;
    homes[index * 3 + 2] = z;
    seeds[index * 4] = random();
    seeds[index * 4 + 1] = random();
    seeds[index * 4 + 2] = random();
    seeds[index * 4 + 3] = random();
    palette[Math.floor(random() * palette.length)].toArray(colors, index * 3);
  }

  geometry.setAttribute("butterflyHome", new THREE.InstancedBufferAttribute(homes, 3));
  geometry.setAttribute("butterflySeed", new THREE.InstancedBufferAttribute(seeds, 4));
  geometry.setAttribute("butterflyColor", new THREE.InstancedBufferAttribute(colors, 3));
  geometry.instanceCount = count;
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(centerX, 1.8, centerZ),
    radius + 5,
  );

  const butterflies = new THREE.Mesh(geometry, createButterflyMaterial(time));
  butterflies.name = "procedural-butterflies";
  butterflies.castShadow = false;
  butterflies.receiveShadow = false;
  butterflies.frustumCulled = true;
  butterflies.renderOrder = 2;
  let cullElapsed = Infinity;
  butterflies.userData.stats = { count, drawCalls: 1 };
  butterflies.userData.update = (
    deltaTime,
    elapsedTime,
    playerPosition,
    force = false,
  ) => {
    cullElapsed += deltaTime;
    if (!force && cullElapsed < 0.16) return;
    cullElapsed = 0;
    butterflies.visible = Math.hypot(
      playerPosition.x - centerX,
      playerPosition.z - centerZ,
    ) < 72;
    if (butterflies.visible) time.value = elapsedTime;
  };
  butterflies.userData.dispose = () => {
    geometry.dispose();
    butterflies.material.dispose();
    baseGeometry.dispose();
  };
  return butterflies;
}

function createFireflyGeometry() {
  const positions = [];
  const parts = [];
  const indices = [];

  const addCross = (radius, part) => {
    pushQuad(
      positions,
      parts,
      indices,
      [
        [0, -radius, 0],
        [radius, 0, 0],
        [0, radius, 0],
        [-radius, 0, 0],
      ],
      part,
    );
    pushQuad(
      positions,
      parts,
      indices,
      [
        [0, -radius, 0],
        [0, 0, radius],
        [0, radius, 0],
        [0, 0, -radius],
      ],
      part,
    );
    pushQuad(
      positions,
      parts,
      indices,
      [
        [0, 0, -radius],
        [radius, 0, 0],
        [0, 0, radius],
        [-radius, 0, 0],
      ],
      part,
    );
  };

  addCross(0.018, 0);
  addCross(0.075, 1);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("fireflyPart", new THREE.Float32BufferAttribute(parts, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createFireflyMaterial(time) {
  const material = new THREE.MeshBasicNodeMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  material.name = "procedural-firefly-material";
  material.toneMapped = false;

  const home = attribute("fireflyHome", "vec3");
  const seed = attribute("fireflySeed", "vec4");
  const part = attribute("fireflyPart", "float");

  material.positionNode = Fn(() => {
    const phase = seed.y.mul(TWO_PI);
    const driftTime = time.mul(seed.x.mul(0.42).add(0.42)).add(phase);
    const driftRadius = seed.z.mul(0.85).add(0.24);
    const driftX = sin(driftTime).mul(driftRadius);
    const driftZ = cos(driftTime.mul(0.77).add(seed.w.mul(2.3)))
      .mul(driftRadius.mul(0.82));
    const driftY = sin(time.mul(0.72).add(phase.mul(1.31))).mul(0.34);
    const scale = seed.w.mul(0.42).add(0.78);

    return vec3(
      home.x.add(driftX).add(positionLocal.x.mul(scale)),
      home.y.add(driftY).add(positionLocal.y.mul(scale)),
      home.z.add(driftZ).add(positionLocal.z.mul(scale)),
    );
  })();

  const pulse = sin(
    time.mul(seed.x.mul(2.2).add(1.35)).add(seed.y.mul(TWO_PI)),
  ).mul(0.5).add(0.5);
  const brightPulse = pulse.mul(pulse).mul(0.86).add(0.14);
  const haloOpacity = mix(1, 0.2, part.clamp(0, 1));
  material.opacityNode = brightPulse.mul(haloOpacity);
  material.colorNode = mix(
    color("#fff6a0"),
    color("#baff52"),
    part.clamp(0, 1),
  );
  return material;
}

export function createFireflyField({
  worldSize = 160,
  count = 128,
  seed = 6197,
} = {}) {
  const random = mulberry32(seed);
  const time = uniform(0);
  const baseGeometry = createFireflyGeometry();
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex(baseGeometry.index);
  geometry.setAttribute("position", baseGeometry.attributes.position);
  geometry.setAttribute("normal", baseGeometry.attributes.normal);
  geometry.setAttribute("fireflyPart", baseGeometry.attributes.fireflyPart);

  const homes = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);
  const halfWorld = worldSize * 0.5 - 3;
  for (let index = 0; index < count; index += 1) {
    const z = (random() * 2 - 1) * halfWorld;
    const nearTrail = random() < 0.58;
    const x = nearTrail
      ? pathCenterX(z) + (random() * 2 - 1) * 11
      : (random() * 2 - 1) * halfWorld;
    homes[index * 3] = x;
    homes[index * 3 + 1] = terrainHeight(x, z) + 0.75 + random() * 1.9;
    homes[index * 3 + 2] = z;
    seeds[index * 4] = random();
    seeds[index * 4 + 1] = random();
    seeds[index * 4 + 2] = random();
    seeds[index * 4 + 3] = random();
  }

  geometry.setAttribute("fireflyHome", new THREE.InstancedBufferAttribute(homes, 3));
  geometry.setAttribute("fireflySeed", new THREE.InstancedBufferAttribute(seeds, 4));
  geometry.instanceCount = count;
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, 1.8, 0),
    Math.hypot(halfWorld, halfWorld) + 5,
  );

  const fireflies = new THREE.Mesh(geometry, createFireflyMaterial(time));
  fireflies.name = "procedural-fireflies";
  fireflies.castShadow = false;
  fireflies.receiveShadow = false;
  fireflies.frustumCulled = false;
  fireflies.renderOrder = 3;
  fireflies.userData.stats = { count, drawCalls: 1 };
  fireflies.userData.update = (_deltaTime, elapsedTime) => {
    time.value = elapsedTime;
  };
  fireflies.userData.dispose = () => {
    geometry.dispose();
    fireflies.material.dispose();
    baseGeometry.dispose();
  };
  return fireflies;
}
