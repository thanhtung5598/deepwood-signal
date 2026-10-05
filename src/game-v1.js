import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { createInPlaceClip } from "./animation-utils.js";
import { createDeferredAssetLoader } from "./deferred-asset-loader.js";
import { createProceduralGrassField } from "./grass-field.js";
import {
  createButterflyField,
  createFireflyField,
  createFlowerGarden,
  createProceduralTerrain,
} from "./procedural-nature.js";
import {
  createAncientOak,
  createBerryBushes,
  createLogs,
  createMountains,
  createRocks,
  createShrubs,
  createTrail,
  createTrees,
  mulberry32,
  pathCenterX,
  terrainHeight,
} from "./lessons/lesson-10.js";

const TOTAL_CORES = 6;
const ROUND_DURATION = 120;
const GAME_WORLD_SIZE = 160;
const GAME_HALF_WORLD = GAME_WORLD_SIZE * 0.5;
const PLAYER_RADIUS = 0.48;
const SPAWN_Z = 12;
const SPAWN_X = pathCenterX(SPAWN_Z);
const ANCIENT_OAK_Z = -34;
const ANCIENT_OAK_X = pathCenterX(ANCIENT_OAK_Z) - 10.5;
const PLAYER_WALK_SPEED = 4.4;
const PLAYER_SPRINT_SPEED = PLAYER_WALK_SPEED * 2;
const FOREST_GUARDIAN_WALK_SPEED = 4.2;
const FOREST_GUARDIAN_SPRINT_SPEED = 7.4;
const FOREST_GUARDIAN_TARGET_HEIGHT = 2.35;
const FOREST_GUARDIAN_ROOT_BONE = "mixamorigHips";
const FOREST_GUARDIAN_ANIMATIONS = {
  idle: "idle.001",
  walk: "walk.001",
  run: "run.001",
  jump: "jump.001",
};
const FOREST_GUARDIAN_TIME_SCALES = {
  idle: 1,
  walk: 2.6,
  run: 1.28,
  jump: 3.1,
};
const HUNTER_MODEL_HEADING_OFFSET = Math.PI - Math.PI / 4;
const HUNTER_CHASE_DISTANCE = 14;
const HUNTER_STOP_CHASE_DISTANCE = 18;
const HUNTER_ANIMATION_DISTANCE = 24;
const HUNTER_RENDER_DISTANCE = 36;
const TREE_RENDER_DISTANCE = 44;
const TREE_SHADOW_DISTANCE = 20;
const ENVIRONMENT_CULL_INTERVAL = 0.18;
const THIRD_PERSON_DISTANCE = 3.25;
const THIRD_PERSON_MIN_DISTANCE = 1.75;
const THIRD_PERSON_MAX_DISTANCE = 7.5;
const THIRD_PERSON_ZOOM_SENSITIVITY = 0.005;
const THIRD_PERSON_SHOULDER_OFFSET = 0.55;
const THIRD_PERSON_BASE_HEIGHT = 0.65;
const VICTORY_TRANSFORM_DURATION = 3.7;
const VICTORY_SWAP_TIME = 2.45;
const BEACON_STILL_DURATION = 1.4;
const BEACON_PLATFORM_TOP_RADIUS = 2.1;
const BEACON_PLATFORM_BOTTOM_RADIUS = 2.35;
const BEACON_PLATFORM_HEIGHT = 0.22;
const BEACON_PLATFORM_SURFACE_OFFSET = 0.21;
const UFO_BEACON_HOVER_HEIGHT = 5.35;
const UFO_BEAM_BOTTOM = 0.23;
const UFO_BEAM_TOP = 4.93;
const UFO_HUNTER_EXCLUSION_RADIUS = 2.75;
const UFO_PLAYER_SAFE_RADIUS = 2.1;
const ENERGY_COLOR = new THREE.Color("#d7ff67");
const WEATHER_ORDER = ["sunny", "rainy"];
const WEATHER_PRESETS = {
  sunny: {
    label: "Sunny",
    icon: "☀",
    fogDay: "#839c91",
    fogNight: "#455750",
    fogDensity: 0.019,
    hemisphereSky: "#dbf3eb",
    hemisphereGround: "#1d3024",
    hemisphereStrength: 1,
    sunColor: "#fff0c8",
    sunStrength: 1,
    exposureOffset: 0,
    grassTint: "#ffffff",
    grassTintAmount: 0,
    terrainTint: "#ffffff",
  },
  rainy: {
    label: "Rainy",
    icon: "☂",
    fogDay: "#697e7a",
    fogNight: "#314541",
    fogDensity: 0.027,
    hemisphereSky: "#aebfbc",
    hemisphereGround: "#182a24",
    hemisphereStrength: 0.78,
    sunColor: "#c9d4cf",
    sunStrength: 0.54,
    exposureOffset: -0.1,
    grassTint: "#315c47",
    grassTintAmount: 0.34,
    terrainTint: "#a1afa5",
  },
};

function gameplayGroundHeight(x, z) {
  const terrainY = terrainHeight(x, z);
  const distanceToBeacon = Math.hypot(x - SPAWN_X, z - SPAWN_Z);
  if (distanceToBeacon > BEACON_PLATFORM_TOP_RADIUS) return terrainY;

  // Mặt beacon là một mesh riêng, cao hơn terrain. Giữ chân nhân vật trên
  // mặt bệ thay vì để collision tiếp tục bám terrain và xuyên xuống bên trong.
  const beaconSurfaceY =
    terrainHeight(SPAWN_X, SPAWN_Z) + BEACON_PLATFORM_SURFACE_OFFSET;
  return Math.max(terrainY, beaconSurfaceY);
}

const canvas = document.querySelector("#game");
const shell = document.querySelector("#game-shell");
const startModal = document.querySelector("#start-modal");
const resultModal = document.querySelector("#result-modal");
const startButton = document.querySelector("#start-button");
const restartButton = document.querySelector("#restart-button");
const pauseMenu = document.querySelector("#pause-menu");
const resumeButton = document.querySelector("#resume-button");
const roundLoading = document.querySelector("#round-loading");
const roundLoadingStatus = document.querySelector("#round-loading-status");
const roundLoadingRetry = document.querySelector("#round-loading-retry");
const roundLabel = document.querySelector("#round-label");
const missionText = document.querySelector("#mission-text");
const timerElement = document.querySelector("#timer");
const healthMeter = document.querySelector("#health-meter");
const healthValue = document.querySelector("#health-value");
const staminaMeter = document.querySelector("#stamina-meter");
const staminaValue = document.querySelector("#stamina-value");
const coreCount = document.querySelector("#core-count");
const cameraModeElement = document.querySelector("#camera-mode");
const damageFlash = document.querySelector("#damage-flash");
const victoryFlash = document.querySelector("#victory-flash");
const toastElement = document.querySelector("#toast");
const loadingScreen = document.querySelector("#loading-screen");
const loadingStatus = document.querySelector("#loading-status");
const loadingPercent = document.querySelector("#loading-percent");
const loadingBar = document.querySelector("#loading-bar");
const loadingProgress = loadingScreen.querySelector("[role='progressbar']");
const minimapCanvas = document.querySelector("#minimap");
const minimapContext = minimapCanvas.getContext("2d");
const mapZoomLabel = document.querySelector("#map-zoom-label");
const mapZoomOutButton = document.querySelector("#map-zoom-out");
const mapZoomInButton = document.querySelector("#map-zoom-in");
const mobileSettingsButton = document.querySelector("#mobile-settings-button");
const mobileSettings = document.querySelector("#mobile-settings");
const mobileSettingsClose = document.querySelector("#mobile-settings-close");
const touchSensitivityInput = document.querySelector("#touch-sensitivity");
const soundVolumeInput = document.querySelector("#sound-volume");
const soundVolumeLabel = document.querySelector("#sound-volume-label");
const mobileSoundToggle = document.querySelector("#mobile-sound-toggle");
const soundToggle = document.querySelector("#sound-toggle");
const soundIcon = document.querySelector("#sound-icon");
const soundToggleLabel = document.querySelector("#sound-toggle-label");
const weatherCycleButton = document.querySelector("#weather-cycle");
const weatherIcon = document.querySelector("#weather-icon");
const weatherLabel = document.querySelector("#weather-label");
const weatherSelect = document.querySelector("#weather-select");
const mobileCameraSetting = document.querySelector("#mobile-camera-setting");
const mobileFullscreenButton = document.querySelector("#mobile-fullscreen");
const mobileQuickFullscreenButton = document.querySelector(
  "#mobile-quick-fullscreen",
);
const mobileJoystick = document.querySelector("#mobile-joystick");
const mobileJoystickStick = document.querySelector("#mobile-joystick-stick");
const mobileCameraAction = document.querySelector("#mobile-camera-action");
const mobileSprintAction = document.querySelector("#mobile-sprint-action");
const mobileJumpAction = document.querySelector("#mobile-jump-action");
const touchLayoutQuery = window.matchMedia(
  "(pointer: coarse), (max-width: 1024px)",
);
const userAgent = navigator.userAgent;
const isAppleMobile =
  /iPad|iPhone|iPod/i.test(userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isSafari =
  /Safari/i.test(userAgent) &&
  !/Chrome|CriOS|FxiOS|EdgiOS|OPiOS|Android/i.test(userAgent);
// WebGPURenderer có WebGL2 backend nhưng lớp tương thích này vẫn có thể tạo
// canvas trống trên Mobile Safari. Dùng WebGLRenderer thuần cho WebKit và khi
// game được mở từ IP HTTP (không phải secure context).
const useCompatibilityRenderer =
  isAppleMobile ||
  isSafari ||
  !window.isSecureContext ||
  !("gpu" in navigator);
const playerModelUrl = useCompatibilityRenderer
  ? "/models/futuristic-robot-animated-mobile.glb"
  : "/models/futuristic-robot-animated.glb";
const forestGuardianModelUrl = useCompatibilityRenderer
  ? "/models/forest-guardian-mecha-animated-mobile.glb"
  : "/models/forest-guardian-mecha-animated.glb";

const SOUND_URLS = {
  robotWalk: "/audio/game-v1/robot-walk.wav",
  robotRun: "/audio/game-v1/robot-run.wav",
  forestAmbience: "/audio/game-v1/forest-ambience.wav",
  monsterAttack: "/audio/game-v1/monster-attack.wav",
  energyHarvest: "/audio/game-v1/energy-harvest.wav",
  transformer: "/audio/game-v1/transformer.wav",
};

function readSoundSetting(key, fallback) {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function saveSoundSetting(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Safari Private Browsing có thể chặn localStorage; âm thanh vẫn hoạt động.
  }
}

const storedSoundVolume = Number(readSoundSetting("deepwood-sound-volume", "0.7"));
let soundVolume = THREE.MathUtils.clamp(
  Number.isFinite(storedSoundVolume) ? storedSoundVolume : 0.7,
  0,
  1,
);
let soundMuted = readSoundSetting("deepwood-sound-muted", "false") === "true";
let footstepCooldown = 0;
let footstepIndex = 0;
let monsterSoundCooldown = 0;

const soundTemplates = new Map();
const soundPools = new Map();
for (const [name, url] of Object.entries(SOUND_URLS)) {
  if (name === "forestAmbience") continue;
  const audio = new Audio(url);
  audio.preload = "auto";
  soundTemplates.set(name, audio);
  soundPools.set(name, []);
}

const forestAmbience = new Audio(SOUND_URLS.forestAmbience);
forestAmbience.preload = "auto";
forestAmbience.loop = true;

function updateSoundControls() {
  soundVolumeInput.value = String(soundVolume);
  soundVolumeLabel.textContent = `${Math.round(soundVolume * 100)}%`;
  mobileSoundToggle.textContent = `Âm thanh · ${soundMuted ? "Tắt" : "Bật"}`;
  mobileSoundToggle.setAttribute("aria-pressed", String(!soundMuted));
  soundToggle.setAttribute("aria-pressed", String(!soundMuted));
  soundToggle.setAttribute(
    "aria-label",
    soundMuted ? "Bật âm thanh" : "Tắt âm thanh",
  );
  soundIcon.textContent = soundMuted ? "×" : "♪";
  soundToggleLabel.textContent = soundMuted ? "Tắt" : "Bật";
  forestAmbience.volume = soundMuted ? 0 : soundVolume * 0.42;
}

function getSoundVoice(name) {
  const pool = soundPools.get(name);
  if (!pool) return null;
  let voice = pool.find((candidate) => candidate.paused || candidate.ended);
  if (!voice && pool.length < 5) {
    voice = soundTemplates.get(name)?.cloneNode();
    if (voice) pool.push(voice);
  }
  if (!voice) voice = pool[0];
  return voice ?? null;
}

function playGameSound(name, { volume = 1, playbackRate = 1 } = {}) {
  if (soundMuted || soundVolume <= 0) return;
  const voice = getSoundVoice(name);
  if (!voice) return;
  voice.pause();
  voice.currentTime = 0;
  voice.volume = THREE.MathUtils.clamp(soundVolume * volume, 0, 1);
  voice.playbackRate = playbackRate;
  voice.preservesPitch = false;
  void voice.play().catch(() => {
    // iOS chỉ mở khóa audio sau thao tác chạm; lần phát kế tiếp sẽ hoạt động.
  });
}

function startForestAmbience() {
  updateSoundControls();
  if (soundMuted || soundVolume <= 0) return;
  void forestAmbience.play().catch(() => {
    // startGame được gọi từ thao tác người dùng và sẽ mở khóa audio trên iOS.
  });
}

function setSoundMuted(muted, announce = true) {
  soundMuted = muted;
  saveSoundSetting("deepwood-sound-muted", String(soundMuted));
  updateSoundControls();
  if (soundMuted) {
    forestAmbience.pause();
    for (const pool of soundPools.values()) {
      for (const voice of pool) voice.pause();
    }
  } else if (gameState === "playing" || gameState === "transforming") {
    startForestAmbience();
  }
  if (announce) showToast(soundMuted ? "Đã tắt âm thanh" : "Đã bật âm thanh");
}

function updateMovementSounds(deltaTime, running) {
  const speed = player.velocity.length();
  if (gameState !== "playing" || !player.grounded || speed < 0.55) {
    footstepCooldown = Math.min(footstepCooldown, 0.06);
    return;
  }

  footstepCooldown -= deltaTime;
  if (footstepCooldown > 0) return;

  const guardian = currentRound === 2;
  const baseRate = guardian ? 0.82 : 1;
  const variation = footstepIndex % 2 === 0 ? 0.035 : -0.025;
  playGameSound(running ? "robotRun" : "robotWalk", {
    volume: running ? (guardian ? 0.62 : 0.52) : guardian ? 0.52 : 0.42,
    playbackRate: baseRate + variation,
  });
  footstepIndex += 1;
  footstepCooldown = (running ? 0.29 : 0.46) * (guardian ? 1.08 : 1);
}

updateSoundControls();

const loadingManager = THREE.DefaultLoadingManager;
// Only round-one assets use this manager. Forest Guardian has its own loader.
const failedAssets = new Set();
const loadingStartedAt = performance.now();
let assetsReady = false;
let resolveModelAssets;
const modelAssetsReady = new Promise((resolve) => {
  resolveModelAssets = resolve;
});

function formatAssetName(url) {
  const filename = decodeURIComponent(url.split("/").pop() || url);
  return filename.replace(/\.(glb|gltf)$/i, "").replace(/[-+_]+/g, " ");
}

function updateLoadingProgress(url, itemsLoaded, itemsTotal) {
  const progress = itemsTotal > 0 ? Math.round((itemsLoaded / itemsTotal) * 100) : 0;
  loadingPercent.textContent = `${progress}%`;
  loadingBar.style.width = `${progress}%`;
  loadingProgress.setAttribute("aria-valuenow", String(progress));
  if (url) loadingStatus.textContent = `Đang tải ${formatAssetName(url)}…`;
}

loadingManager.onStart = (url, itemsLoaded, itemsTotal) => {
  updateLoadingProgress(url, itemsLoaded, itemsTotal);
};
loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
  updateLoadingProgress(url, itemsLoaded, itemsTotal);
};
loadingManager.onError = (url) => {
  failedAssets.add(url);
};
loadingManager.onLoad = () => {
  resolveModelAssets();
};

const scene = new THREE.Scene();
scene.background = new THREE.Color("#8ba9a0");
scene.fog = new THREE.FogExp2("#839c91", 0.019);

const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 150);
const renderer = useCompatibilityRenderer
  ? new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    })
  : new WebGPURenderer({ canvas, antialias: true });
renderer.setPixelRatio(
  Math.min(window.devicePixelRatio, useCompatibilityRenderer ? 1.1 : 1.5),
);
renderer.shadowMap.enabled = !useCompatibilityRenderer;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.03;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const rendererReady = (
  useCompatibilityRenderer ? Promise.resolve() : renderer.init()
).then(() => {
  const rendererName = useCompatibilityRenderer
    ? "webgl2-mobile"
    : renderer.backend.isWebGPUBackend
      ? "webgpu"
      : "webgl2";
  canvas.dataset.renderer = rendererName;
  console.info(`Deepwood renderer: ${rendererName.toUpperCase()}`);
});

const fontsReady = document.fonts?.ready ?? Promise.resolve();
Promise.all([modelAssetsReady, fontsReady, rendererReady]).then(() => {
  const minimumDisplayTime = 700;
  const remainingDelay = Math.max(0, minimumDisplayTime - (performance.now() - loadingStartedAt));
  window.setTimeout(() => {
    assetsReady = true;
    loadingPercent.textContent = "100%";
    loadingBar.style.width = "100%";
    loadingProgress.setAttribute("aria-valuenow", "100");
    loadingStatus.textContent = failedAssets.size
      ? `Sẵn sàng với ${failedAssets.size} tài nguyên fallback`
      : "Tài nguyên vòng 1 đã sẵn sàng";
    startButton.disabled = false;
    startModal.classList.add("is-visible");
    window.setTimeout(() => loadingScreen.classList.add("is-complete"), 180);
  }, remainingDelay);
});

const hemisphere = new THREE.HemisphereLight("#dbf3eb", "#1d3024", 2.25);
const sun = new THREE.DirectionalLight("#fff0c8", 3.55);
sun.position.set(-18, 30, 14);
sun.castShadow = !useCompatibilityRenderer;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -28;
sun.shadow.camera.right = 28;
sun.shadow.camera.top = 28;
sun.shadow.camera.bottom = -28;
sun.shadow.camera.near = 2;
sun.shadow.camera.far = 75;
sun.shadow.bias = -0.0007;
scene.add(hemisphere, sun, sun.target);

const sunDisc = new THREE.Mesh(
  new THREE.SphereGeometry(2, 20, 12),
  new THREE.MeshBasicMaterial({ color: "#ffe4a0", fog: false }),
);
sunDisc.position.set(-34, 34, -58);
scene.add(sunDisc);

function createCompatibilityEffectGroup(name) {
  const group = new THREE.Group();
  group.name = name;
  group.userData.update = () => {};
  return group;
}

function createCompatibilityGrassField({
  worldSize = GAME_WORLD_SIZE,
  seed = 104729,
} = {}) {
  const group = createCompatibilityEffectGroup("mobile-webgl-grass");
  const bladeCount = 2200;
  const bladeGeometry = new THREE.ConeGeometry(0.035, 0.58, 3, 1);
  bladeGeometry.translate(0, 0.29, 0);
  const baseBladeColor = new THREE.Color("#557442");
  const weatherBladeColor = new THREE.Color();
  const bladeMaterial = new THREE.MeshStandardMaterial({
    color: baseBladeColor,
    roughness: 0.96,
    metalness: 0,
  });
  const blades = new THREE.InstancedMesh(
    bladeGeometry,
    bladeMaterial,
    bladeCount,
  );
  const randomGrass = mulberry32(seed);
  const transform = new THREE.Object3D();
  const halfWorld = worldSize * 0.5;
  let created = 0;
  let attempts = 0;

  while (created < bladeCount && attempts < bladeCount * 5) {
    attempts += 1;
    const x = (randomGrass() * 2 - 1) * halfWorld;
    const z = (randomGrass() * 2 - 1) * halfWorld;
    if (Math.abs(x - pathCenterX(z)) < 1.9) continue;

    const heightScale = 0.65 + randomGrass() * 0.75;
    transform.position.set(x, terrainHeight(x, z) + 0.01, z);
    transform.rotation.set(0, randomGrass() * Math.PI * 2, 0);
    transform.scale.set(
      0.75 + randomGrass() * 0.55,
      heightScale,
      0.75 + randomGrass() * 0.55,
    );
    transform.updateMatrix();
    blades.setMatrixAt(created, transform.matrix);
    created += 1;
  }

  blades.count = created;
  blades.instanceMatrix.needsUpdate = true;
  blades.computeBoundingSphere();
  blades.castShadow = false;
  blades.receiveShadow = false;
  group.add(blades);
  group.userData.setWeatherTint = (value, amount = 0) => {
    weatherBladeColor.set(value);
    bladeMaterial.color
      .copy(baseBladeColor)
      .lerp(weatherBladeColor, THREE.MathUtils.clamp(amount, 0, 1));
  };
  return group;
}

function createCompatibilityTerrain({
  worldSize = GAME_WORLD_SIZE,
  segments = 128,
} = {}) {
  const geometry = new THREE.PlaneGeometry(
    worldSize,
    worldSize,
    segments,
    segments,
  );
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const lowGrass = new THREE.Color("#405f35");
  const highGrass = new THREE.Color("#728454");
  const soil = new THREE.Color("#705e42");
  const vertexColor = new THREE.Color();

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const height = terrainHeight(x, z);
    positions.setY(index, height);

    const heightBlend = THREE.MathUtils.clamp((height + 2.4) * 0.19, 0, 1);
    const pathDistance = Math.abs(x - pathCenterX(z));
    const pathBlend = Math.exp(-(pathDistance * pathDistance) * 0.2) * 0.78;
    vertexColor.copy(lowGrass).lerp(highGrass, heightBlend).lerp(soil, pathBlend);
    colors[index * 3] = vertexColor.r;
    colors[index * 3 + 1] = vertexColor.g;
    colors[index * 3 + 2] = vertexColor.b;
  }

  positions.needsUpdate = true;
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const terrain = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0,
    }),
  );
  terrain.name = "mobile-webgl-terrain";
  terrain.receiveShadow = false;
  terrain.frustumCulled = false;
  terrain.userData.stats = { segments, vertices: positions.count };
  return terrain;
}

// Reuse the complete forest kit from Lesson 10. Lesson 11's movement and
// camera controller is implemented below as the base of the standalone game.
const random = mulberry32(104729);
const treeColliders = [];
const rockColliders = [];
const logColliders = [];
const shrubColliders = [];
const berryBushColliders = [];
const terrain = useCompatibilityRenderer
  ? createCompatibilityTerrain({
      worldSize: GAME_WORLD_SIZE,
      segments: 128,
    })
  : createProceduralTerrain({
      worldSize: GAME_WORLD_SIZE,
      segments: 256,
    });
const trail = createTrail({ worldSize: GAME_WORLD_SIZE, segments: 160 });
const trees = createTrees(random, treeColliders, {
  modelUrl: useCompatibilityRenderer
    ? null
    : "/models/stylized-layered-evergreen-tree.glb",
  chunkSize: 12,
  worldHalfExtent: GAME_HALF_WORLD,
});
const ancientOak = createAncientOak(treeColliders, {
  modelUrl: useCompatibilityRenderer ? null : "/models/majestic-ancient-oak.glb",
  position: {
    x: ANCIENT_OAK_X,
    z: ANCIENT_OAK_Z,
  },
  rotationY: 0.62,
});
// Model có bộ rễ rất rộng. Hạ toàn bộ cây xuống thay vì đặt đúng tại đáy
// bounding box để các đầu rễ cắm vào sườn địa hình, không còn cảm giác lơ lửng.
ancientOak.position.y -= 0.72;
const rocks = createRocks(random, rockColliders, {
  modelUrl: useCompatibilityRenderer ? null : "/models/mossy-faceted-boulder.glb",
  castShadow: false,
  worldHalfExtent: GAME_HALF_WORLD,
});
const logs = createLogs(random, logColliders, [...treeColliders, ...rockColliders], {
  modelUrl: useCompatibilityRenderer ? null : "/models/weathered-hollow-log.glb",
  castShadow: false,
  worldHalfExtent: GAME_HALF_WORLD,
});
const shrubs = createShrubs(
  random,
  shrubColliders,
  [...treeColliders, ...rockColliders, ...logColliders],
  {
    modelUrl: useCompatibilityRenderer
      ? null
      : "/models/stylized-multi-trunk-leafy-shrub.glb",
    castShadow: false,
    receiveShadow: false,
    worldHalfExtent: GAME_HALF_WORLD,
  },
);
const berryBushes = createBerryBushes(
  random,
  berryBushColliders,
  [...treeColliders, ...rockColliders, ...logColliders, ...shrubColliders],
  {
    modelUrl: useCompatibilityRenderer
      ? null
      : "/models/bountiful-red-berry-bush.glb",
    castShadow: false,
    receiveShadow: false,
    worldHalfExtent: GAME_HALF_WORLD,
  },
);
const grass = useCompatibilityRenderer
  ? createCompatibilityGrassField({
      worldSize: GAME_WORLD_SIZE,
      seed: 104729,
    })
  : createProceduralGrassField({
      worldSize: GAME_WORLD_SIZE,
      seed: 104729,
    });
const flowerGarden = useCompatibilityRenderer
  ? createCompatibilityEffectGroup("mobile-webgl-flowers")
  : createFlowerGarden({
      worldSize: GAME_WORLD_SIZE,
      avoidX: ANCIENT_OAK_X,
      avoidZ: ANCIENT_OAK_Z,
      count: 2250,
      seed: 4813,
    });
const butterflies = useCompatibilityRenderer
  ? createCompatibilityEffectGroup("mobile-webgl-butterflies")
  : createButterflyField({
      centerX: ANCIENT_OAK_X,
      centerZ: ANCIENT_OAK_Z,
      radius: 15,
      count: 24,
      seed: 9281,
    });
const fireflies = useCompatibilityRenderer
  ? createCompatibilityEffectGroup("mobile-webgl-fireflies")
  : createFireflyField({
      worldSize: GAME_WORLD_SIZE,
      count: 128,
      seed: 6197,
    });
const mountains = createMountains({ worldHalfExtent: GAME_HALF_WORLD });
mountains.traverse((object) => {
  if (object.isMesh) object.castShadow = false;
});
const worldColliders = [
  ...treeColliders,
  ...rockColliders,
  ...logColliders,
  ...shrubColliders,
  ...berryBushColliders,
];
terrain.receiveShadow = true;
trail.receiveShadow = true;
scene.add(
  terrain,
  trail,
  mountains,
  trees,
  ancientOak,
  rocks,
  logs,
  shrubs,
  berryBushes,
  grass,
  flowerGarden,
  butterflies,
  fireflies,
);

function createWeatherEffects() {
  const group = new THREE.Group();
  group.name = "game-weather-effects";
  const weatherRandom = mulberry32(93751);
  const rainCount = useCompatibilityRenderer ? 260 : 560;
  const rainPositions = new Float32Array(rainCount * 6);
  const rainSpeeds = new Float32Array(rainCount);

  const resetRainDrop = (index, initial = false) => {
    const offset = index * 6;
    const x = (weatherRandom() * 2 - 1) * 19;
    const z = (weatherRandom() * 2 - 1) * 19;
    const top = initial ? weatherRandom() * 23 : 18 + weatherRandom() * 7;
    const length = 0.48 + weatherRandom() * 0.72;
    rainPositions[offset] = x;
    rainPositions[offset + 1] = top;
    rainPositions[offset + 2] = z;
    rainPositions[offset + 3] = x - 0.08;
    rainPositions[offset + 4] = top - length;
    rainPositions[offset + 5] = z + 0.04;
    rainSpeeds[index] = 15 + weatherRandom() * 12;
  };
  for (let index = 0; index < rainCount; index += 1) {
    resetRainDrop(index, true);
  }

  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(rainPositions, 3),
  );
  const rain = new THREE.LineSegments(
    rainGeometry,
    new THREE.LineBasicMaterial({
      color: "#b9d8df",
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    }),
  );
  rain.frustumCulled = false;
  rain.visible = false;

  group.add(rain);

  group.userData.setMode = (mode) => {
    rain.visible = mode === "rainy";
  };
  group.userData.update = (deltaTime, time, playerPosition, mode) => {
    group.position.set(playerPosition.x, 0, playerPosition.z);
    if (mode === "rainy") {
      for (let index = 0; index < rainCount; index += 1) {
        const offset = index * 6;
        const fall = rainSpeeds[index] * deltaTime;
        rainPositions[offset + 1] -= fall;
        rainPositions[offset + 4] -= fall;
        rainPositions[offset] -= deltaTime * 1.25;
        rainPositions[offset + 3] -= deltaTime * 1.25;
        if (rainPositions[offset + 1] < -0.6) resetRainDrop(index);
      }
      rainGeometry.attributes.position.needsUpdate = true;
    }
  };

  return group;
}

const weatherEffects = createWeatherEffects();
scene.add(weatherEffects);

const playerRoot = new THREE.Group();
scene.add(playerRoot);

const playerMarker = new THREE.Mesh(
  new THREE.RingGeometry(0.58, 0.7, 40),
  new THREE.MeshBasicMaterial({
    color: "#d7ff67",
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
);
playerMarker.rotation.x = -Math.PI / 2;
playerMarker.position.y = 0.04;
playerRoot.add(playerMarker);

const player = {
  model: null,
  mixer: null,
  actions: new Map(),
  activeAction: null,
  activeState: "",
  velocity: new THREE.Vector3(),
  targetVelocity: new THREE.Vector3(),
  verticalVelocity: 0,
  jumpHeight: 0,
  grounded: true,
  modelBasePosition: new THREE.Vector3(),
  modelBaseScale: new THREE.Vector3(1, 1, 1),
  modelBaseQuaternion: new THREE.Quaternion(),
  transformedModel: null,
  transformedMixer: null,
  transformedActions: new Map(),
  transformedActiveAction: null,
  transformedActiveState: "",
  transformedBasePosition: new THREE.Vector3(),
  transformedBaseScale: new THREE.Vector3(1, 1, 1),
};

function createVictoryTransformationFx() {
  const group = new THREE.Group();
  group.visible = false;

  const rings = [0.58, 1.12, 1.68].map((height, index) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.7 + index * 0.08, 0.018, 8, 64),
      new THREE.MeshBasicMaterial({
        color: ENERGY_COLOR,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    ring.position.y = height;
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    return ring;
  });

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 28, 20),
    new THREE.MeshBasicMaterial({
      color: ENERGY_COLOR,
      transparent: true,
      opacity: 0,
      wireframe: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  shell.position.y = 1.15;
  shell.scale.set(0.72, 1.18, 0.72);
  group.add(shell);

  const particlePositions = new Float32Array(42 * 3);
  for (let index = 0; index < 42; index += 1) {
    const angle = index * 2.39996;
    const radius = 0.42 + (index % 7) * 0.09;
    particlePositions[index * 3] = Math.cos(angle) * radius;
    particlePositions[index * 3 + 1] = 0.18 + (index % 14) * 0.14;
    particlePositions[index * 3 + 2] = Math.sin(angle) * radius;
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(particlePositions, 3),
  );
  const particles = new THREE.Points(
    particleGeometry,
    new THREE.PointsMaterial({
      color: ENERGY_COLOR,
      size: 0.055,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  group.add(particles);

  const light = new THREE.PointLight(ENERGY_COLOR, 0, 7, 1.8);
  light.position.y = 1.35;
  group.add(light);
  group.userData = { rings, shell, particles, light };
  return group;
}

function createTransformedCore() {
  const group = new THREE.Group();
  group.visible = false;
  group.position.set(0, 1.58, 0.29);

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 20, 14),
    new THREE.MeshBasicMaterial({
      color: ENERGY_COLOR,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.105, 1),
    new THREE.MeshStandardMaterial({
      color: "#eaffab",
      emissive: ENERGY_COLOR,
      emissiveIntensity: 4.2,
      roughness: 0.18,
      metalness: 0.2,
    }),
  );
  const light = new THREE.PointLight(ENERGY_COLOR, 2.6, 5.5, 2);
  group.add(halo, core, light);
  group.userData = { halo, core, light };
  return group;
}

const victoryTransformationFx = createVictoryTransformationFx();
const transformedCore = createTransformedCore();
playerRoot.add(victoryTransformationFx, transformedCore);

function playAnimation(name) {
  const transformed = currentRound === 2;
  const mixer = transformed ? player.transformedMixer : player.mixer;
  const actions = transformed ? player.transformedActions : player.actions;
  const activeState = transformed
    ? player.transformedActiveState
    : player.activeState;
  if (!mixer || activeState === name) return;
  const nextAction = actions.get(name);
  if (!nextAction) return;

  nextAction.reset();
  nextAction.enabled = true;
  nextAction.setEffectiveWeight(1);
  nextAction.setEffectiveTimeScale(
    transformed
      ? (FOREST_GUARDIAN_TIME_SCALES[name] ?? 1)
      : name === "run"
        ? 1.35
        : name === "walk"
          ? 1.12
          : name === "jump"
            ? 1.08
            : 1,
  );
  nextAction.setLoop(name === "jump" ? THREE.LoopOnce : THREE.LoopRepeat, name === "jump" ? 1 : Infinity);
  nextAction.clampWhenFinished = name === "jump";
  nextAction.fadeIn(0.16).play();
  if (transformed) {
    player.transformedActiveAction?.fadeOut(0.16);
    player.transformedActiveAction = nextAction;
    player.transformedActiveState = name;
  } else {
    player.activeAction?.fadeOut(0.16);
    player.activeAction = nextAction;
    player.activeState = name;
  }
}

new GLTFLoader().load(
  playerModelUrl,
  (gltf) => {
    player.model = gltf.scene;
    player.model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(player.model);
    const sourceHeight = bounds.getSize(new THREE.Vector3()).y;
    player.model.scale.setScalar(sourceHeight > 0 ? 2.15 / sourceHeight : 1);
    player.model.updateMatrixWorld(true);
    bounds.setFromObject(player.model);
    const center = bounds.getCenter(new THREE.Vector3());
    player.model.position.set(-center.x, -bounds.min.y, -center.z);
    player.modelBasePosition.copy(player.model.position);
    player.modelBaseScale.copy(player.model.scale);
    player.modelBaseQuaternion.copy(player.model.quaternion);
    player.model.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });
    playerRoot.add(player.model);
    player.mixer = new THREE.AnimationMixer(player.model);
    for (const clip of gltf.animations) {
      player.actions.set(clip.name, player.mixer.clipAction(clip));
    }
    playAnimation("idle");
  },
  undefined,
  (error) => console.error("Không tải được nhân vật v1", error),
);

const loadForestGuardian = createDeferredAssetLoader(async () => {
  // A separate manager keeps background work out of the startup progress/gate.
  const loader = new GLTFLoader(new THREE.LoadingManager());
  const gltf = await loader.loadAsync(forestGuardianModelUrl);
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const sourceHeight = bounds.getSize(new THREE.Vector3()).y;
  model.scale.setScalar(
    sourceHeight > 0 ? FOREST_GUARDIAN_TARGET_HEIGHT / sourceHeight : 1,
  );
  model.updateMatrixWorld(true);
  bounds.setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -bounds.min.y, -center.z);
  model.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  model.visible = false;
  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map();
  const rootPosition = model.getObjectByName(
    FOREST_GUARDIAN_ROOT_BONE,
  )?.position;
  for (const [state, clipName] of Object.entries(
    FOREST_GUARDIAN_ANIMATIONS,
  )) {
    const sourceClip = gltf.animations.find((clip) => clip.name === clipName);
    if (!sourceClip) continue;
    const playableClip = rootPosition
      ? createInPlaceClip(
          sourceClip,
          FOREST_GUARDIAN_ROOT_BONE,
          rootPosition,
          state === "jump",
        )
      : sourceClip;
    actions.set(
      state,
      mixer.clipAction(playableClip),
    );
  }
  // Publish the model only after its animation setup has also succeeded.
  playerRoot.add(model);
  player.transformedBasePosition.copy(model.position);
  player.transformedBaseScale.copy(model.scale);
  player.transformedMixer = mixer;
  player.transformedActions = actions;
  player.transformedModel = model;
});

function createBeacon() {
  const group = new THREE.Group();
  group.position.set(SPAWN_X, terrainHeight(SPAWN_X, SPAWN_Z), SPAWN_Z);

  const hullMaterial = new THREE.MeshStandardMaterial({
    color: "#384841",
    roughness: 0.3,
    metalness: 0.82,
  });
  const darkHullMaterial = new THREE.MeshStandardMaterial({
    color: "#15211d",
    roughness: 0.48,
    metalness: 0.68,
  });
  const energyMaterial = new THREE.MeshStandardMaterial({
    color: "#7fae70",
    emissive: ENERGY_COLOR,
    emissiveIntensity: 1.7,
    roughness: 0.28,
    metalness: 0.25,
  });
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(
      BEACON_PLATFORM_TOP_RADIUS,
      BEACON_PLATFORM_BOTTOM_RADIUS,
      BEACON_PLATFORM_HEIGHT,
      32,
    ),
    new THREE.MeshStandardMaterial({
      color: "#2b3d35",
      roughness: 0.76,
      metalness: 0.4,
    }),
  );
  base.position.y =
    BEACON_PLATFORM_SURFACE_OFFSET - BEACON_PLATFORM_HEIGHT * 0.5;
  base.receiveShadow = true;
  group.add(base);

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: "#d7ff67",
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.72, 56), ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.23;
  group.add(ring);

  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(
      0.14,
      1.48,
      UFO_BEAM_TOP - UFO_BEAM_BOTTOM,
      32,
      1,
      true,
    ),
    new THREE.MeshBasicMaterial({
      color: "#d7ff67",
      transparent: true,
      opacity: 0.055,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  column.position.y = (UFO_BEAM_TOP + UFO_BEAM_BOTTOM) * 0.5;
  group.add(column);

  const ufo = new THREE.Group();
  ufo.position.y = UFO_BEACON_HOVER_HEIGHT;
  ufo.scale.setScalar(0.78);

  const upperHull = new THREE.Mesh(
    new THREE.CylinderGeometry(1.16, 1.82, 0.34, 40),
    hullMaterial,
  );
  upperHull.position.y = 0.08;
  upperHull.castShadow = !useCompatibilityRenderer;

  const lowerHull = new THREE.Mesh(
    new THREE.CylinderGeometry(1.82, 0.68, 0.3, 40),
    darkHullMaterial,
  );
  lowerHull.position.y = -0.24;
  lowerHull.castShadow = !useCompatibilityRenderer;

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(1.72, 0.09, 10, 56),
    energyMaterial,
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -0.08;

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.82, 32, 16),
    new THREE.MeshStandardMaterial({
      color: "#a9ddd0",
      emissive: "#315f55",
      emissiveIntensity: 0.7,
      transparent: true,
      opacity: 0.72,
      roughness: 0.12,
      metalness: 0.18,
      depthWrite: false,
    }),
  );
  dome.scale.y = 0.46;
  dome.position.y = 0.38;

  const emitter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.38, 0.34, 24),
    energyMaterial,
  );
  emitter.position.y = -0.48;

  const signalLights = [];
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    const signalLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 10, 8),
      energyMaterial,
    );
    signalLight.position.set(
      Math.cos(angle) * 1.48,
      -0.18,
      Math.sin(angle) * 1.48,
    );
    signalLights.push(signalLight);
    ufo.add(signalLight);
  }

  ufo.add(upperHull, lowerHull, rim, dome, emitter);
  group.add(ufo);

  const light = new THREE.SpotLight(
    "#d7ff67",
    7,
    12,
    Math.PI * 0.19,
    0.58,
    1.35,
  );
  light.position.y = UFO_BEACON_HOVER_HEIGHT - 0.42;
  light.target.position.y = BEACON_PLATFORM_SURFACE_OFFSET;
  group.add(light, light.target);

  group.userData = { ring, column, light, ufo, rim, emitter, signalLights };
  return group;
}

const beacon = createBeacon();
scene.add(beacon);

const coreLocations = [
  { z: 30, offset: -2.6 },
  { z: 20, offset: 4.2 },
  { z: 2, offset: -4.5 },
  { z: -10, offset: 3.8 },
  { z: -23, offset: -3.3 },
  { z: -34, offset: 2.2 },
];

function createEnergyCore(location, index) {
  const group = new THREE.Group();
  const x = pathCenterX(location.z) + location.offset;
  const y = terrainHeight(x, location.z) + 1.15;
  group.position.set(x, y, location.z);

  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.36, 0),
    new THREE.MeshStandardMaterial({
      color: "#d7ff67",
      emissive: "#92c72b",
      emissiveIntensity: 2.2,
      roughness: 0.18,
      metalness: 0.35,
    }),
  );
  crystal.castShadow = true;
  group.add(crystal);

  const orbit = new THREE.Mesh(
    new THREE.TorusGeometry(0.59, 0.023, 8, 40),
    new THREE.MeshBasicMaterial({ color: "#e6ff9d", transparent: true, opacity: 0.75 }),
  );
  orbit.rotation.x = Math.PI / 2;
  group.add(orbit);

  const groundRing = new THREE.Mesh(
    new THREE.RingGeometry(0.45, 0.7, 32),
    new THREE.MeshBasicMaterial({
      color: "#d7ff67",
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  groundRing.rotation.x = -Math.PI / 2;
  groundRing.position.y = -1.08;
  group.add(groundRing);

  group.userData = { index, crystal, orbit, baseY: y, collected: false };
  scene.add(group);
  return group;
}

const energyCores = coreLocations.map(createEnergyCore);

function createHunter(anchor, index) {
  const group = new THREE.Group();
  group.position.set(anchor.x, terrainHeight(anchor.x, anchor.z) + 1.55, anchor.z);
  const fallback = new THREE.Group();
  group.add(fallback);

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: "#111613",
    emissive: "#39090a",
    emissiveIntensity: 0.65,
    roughness: 0.62,
  });
  const body = new THREE.Mesh(new THREE.TetrahedronGeometry(0.58, 0), bodyMaterial);
  body.scale.set(0.78, 0.65, 1.35);
  body.rotation.x = 0.35;
  body.castShadow = true;
  fallback.add(body);

  const wingGeometry = new THREE.BufferGeometry();
  wingGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0, -1.25, 0.08, 0.4, -0.28, -0.05, -0.55], 3),
  );
  wingGeometry.computeVertexNormals();
  const wingMaterial = new THREE.MeshStandardMaterial({
    color: "#17201a",
    emissive: "#240506",
    emissiveIntensity: 0.5,
    side: THREE.DoubleSide,
    roughness: 0.85,
  });
  const leftWing = new THREE.Mesh(wingGeometry, wingMaterial);
  const rightWing = leftWing.clone();
  rightWing.scale.x = -1;
  fallback.add(leftWing, rightWing);

  const eyeMaterial = new THREE.MeshBasicMaterial({ color: "#ff4b40" });
  for (const x of [-0.14, 0.14]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), eyeMaterial);
    eye.position.set(x, 0.11, -0.5);
    fallback.add(eye);
  }

  group.userData = {
    anchor: new THREE.Vector3(anchor.x, 0, anchor.z),
    phase: index * 1.71,
    speed: 1.25 + index * 0.09,
    leftWing,
    rightWing,
    fallback,
    model: null,
    visualRig: null,
    wingBones: null,
    attackTime: 0,
    attackCooldown: index * 0.35,
    attackDidDamage: false,
    chasing: false,
  };
  scene.add(group);
  return group;
}

const hunters = [
  { x: pathCenterX(24) + 8, z: 24 },
  { x: pathCenterX(0) - 9, z: 0 },
  { x: pathCenterX(-18) + 8, z: -18 },
  { x: pathCenterX(-32) - 7, z: -32 },
].map(createHunter);

// Mobile giữ Bóng Săn procedural để tránh giải nén thêm ba texture 4K. Desktop
// tải một lần rồi clone cả skeleton cho bốn Bóng Săn.
if (!useCompatibilityRenderer) {
  new GLTFLoader().load(
    "/models/fantasy-bird.glb",
    (gltf) => {
    gltf.scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(gltf.scene);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const largestDimension = Math.max(size.x, size.y, size.z);
    if (largestDimension <= 0) return;

    const fittedScale = 2.65 / largestDimension;
    for (const hunter of hunters) {
      const model = cloneSkeleton(gltf.scene);
      const visualRig = new THREE.Group();
      model.scale.setScalar(fittedScale);
      model.position.set(
        -center.x * fittedScale,
        -center.y * fittedScale,
        -center.z * fittedScale,
      );
      // Fantasy Bird được dựng chéo khoảng 45°. Offset đưa mỏ chim về đúng
      // hướng +Z mà AI Bóng Săn đang sử dụng.
      model.rotation.y = HUNTER_MODEL_HEADING_OFFSET;
      model.traverse((object) => {
        if (!object.isMesh) return;
        object.castShadow = true;
        object.receiveShadow = true;
        object.frustumCulled = true;
      });
      hunter.remove(hunter.userData.fallback);
      visualRig.add(model);
      hunter.add(visualRig);
      hunter.userData.model = model;
      hunter.userData.visualRig = visualRig;

      const wingPairs = [
        ["bone_6", "bone_10", 1.05, 0, 0.025, 0.28],
        ["bone_7", "bone_11", 0.34, 0.16, 0.055, 0.08],
        ["bone_8", "bone_12", 0.2, 0.34, 0.09, 0.05],
        ["bone_9", "bone_13", 0.12, 0.5, 0.12, 0.03],
      ];
      hunter.userData.wingBones = wingPairs
        .map(([leftName, rightName, amount, lag, twist, downBias]) => {
          const left = model.getObjectByName(leftName);
          const right = model.getObjectByName(rightName);
          if (!left?.isBone || !right?.isBone) return null;
          return {
            left,
            right,
            amount,
            lag,
            twist,
            downBias,
            leftBase: left.quaternion.clone(),
            rightBase: right.quaternion.clone(),
            leftFlap: new THREE.Quaternion(),
            rightFlap: new THREE.Quaternion(),
            leftTwist: new THREE.Quaternion(),
            rightTwist: new THREE.Quaternion(),
          };
        })
        .filter(Boolean);
    }
    },
    undefined,
    (error) => console.error("Không tải được model Bóng Săn", error),
  );
}

const pressedKeys = new Set();
const touchMovement = new THREE.Vector2();
const flatForward = new THREE.Vector3();
const cameraRight = new THREE.Vector3();
const moveDirection = new THREE.Vector3();
const desiredCamera = new THREE.Vector3();
const cameraTarget = new THREE.Vector3();
const lookDirection = new THREE.Vector3();
const targetFacing = new THREE.Quaternion();
const hunterDirection = new THREE.Vector3();
const hunterWingAxis = new THREE.Vector3(0, 0, 1);
const hunterWingTwistAxis = new THREE.Vector3(1, 0, 0);

let gameState = "intro";
let cameraMode = "third";
let yaw = 0;
let pitch = 0.12;
let thirdPersonDistance = THIRD_PERSON_DISTANCE;
let targetThirdPersonDistance = THIRD_PERSON_DISTANCE;
let mouseDragging = false;
let wasPointerLocked = false;
let joystickPointerId = null;
let lookPointerId = null;
let lookPointerX = 0;
let lookPointerY = 0;
let touchSprintPressed = false;
let touchJumpPressed = false;
let touchLookSensitivity = 1;
let minimapWorldSpan = 90;
let minimapElapsed = 1;
let jumpWasPressed = false;
let health = 100;
let stamina = 100;
let sprintExhausted = false;
let currentRound = 1;
let collectedCores = 0;
let timeRemaining = ROUND_DURATION;
let elapsedTime = 0;
let damageCooldown = 0;
let toastTimeout = 0;
let environmentCullElapsed = ENVIRONMENT_CULL_INTERVAL;
let victoryTransformation = null;
let beaconStillTime = 0;
let wasInsideBeacon = false;
let currentWeather = "sunny";

const victoryPoseConfig = [
  ["Waist", [13, 0, 0]],
  ["Spine01", [9, 0, 0]],
  ["Spine02", [7, 0, 0]],
  ["Head", [-9, 0, 0]],
  ["L_Upperarm", [20, 0, -18]],
  ["R_Upperarm", [20, 0, 18]],
  ["L_Forearm", [-58, 0, 0]],
  ["R_Forearm", [-58, 0, 0]],
  ["L_Thigh", [17, 0, 0]],
  ["R_Thigh", [17, 0, 0]],
  ["L_Calf", [-28, 0, 0]],
  ["R_Calf", [-28, 0, 0]],
];

function smoothProgress(value, start, end) {
  return THREE.MathUtils.smoothstep(
    THREE.MathUtils.clamp((value - start) / (end - start), 0, 1),
    0,
    1,
  );
}

function collectVictoryMaterials(root) {
  const materialStates = [];
  const visited = new Set();
  root?.traverse((object) => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (!material?.emissive || visited.has(material)) continue;
      visited.add(material);
      materialStates.push({
        material,
        emissive: material.emissive.clone(),
        emissiveIntensity: material.emissiveIntensity ?? 1,
      });
    }
  });
  return materialStates;
}

function restoreVictoryVisuals() {
  if (victoryTransformation?.bones) {
    for (const { bone, base } of victoryTransformation.bones) {
      bone.quaternion.copy(base);
    }
  }
  if (victoryTransformation?.materials) {
    for (const state of victoryTransformation.materials) {
      state.material.emissive.copy(state.emissive);
      state.material.emissiveIntensity = state.emissiveIntensity;
    }
  }

  victoryTransformation = null;
  victoryTransformationFx.visible = false;
  transformedCore.visible = false;
  victoryFlash.classList.remove("is-active");
  player.transformedMixer?.stopAllAction();
  player.transformedActiveAction = null;
  player.transformedActiveState = "";
  if (player.transformedModel) {
    player.transformedModel.visible = false;
    player.transformedModel.position.copy(player.transformedBasePosition);
    player.transformedModel.scale.copy(player.transformedBaseScale);
  }
  if (player.model) {
    player.mixer?.stopAllAction();
    player.model.visible = true;
    player.model.position.copy(player.modelBasePosition);
    player.model.scale.copy(player.modelBaseScale);
    player.model.quaternion.copy(player.modelBaseQuaternion);
    player.activeAction = null;
    player.activeState = "";
    playAnimation("idle");
  }
}

function beginVictoryTransformation() {
  if (gameState !== "playing" || currentRound !== 1) return;
  if (!player.transformedModel) {
    waitForRoundTwo();
    return;
  }
  gameState = "transforming";
  playGameSound("transformer", { volume: 0.82 });
  pressedKeys.clear();
  resetTouchInput();
  document.exitPointerLock?.();
  cameraMode = "third";
  cameraModeElement.textContent = "TRANSFORMATION";
  targetThirdPersonDistance = 4.6;
  playerMarker.visible = false;
  if (player.model) player.model.visible = true;
  player.velocity.set(0, 0, 0);
  player.targetVelocity.set(0, 0, 0);
  player.mixer?.stopAllAction();

  const bones = victoryPoseConfig
    .map(([name, degrees]) => {
      const bone = player.model?.getObjectByName(name);
      return bone?.isBone
        ? { bone, base: bone.quaternion.clone(), degrees }
        : null;
    })
    .filter(Boolean);

  victoryTransformation = {
    time: 0,
    swapped: false,
    bones,
    materials: collectVictoryMaterials(player.model),
  };
  victoryTransformationFx.visible = true;
  missionText.textContent = "Năng lượng đang cộng hưởng";
  showToast("Lõi năng lượng thức tỉnh — bắt đầu biến hình!");
}

async function waitForRoundTwo() {
  gameState = "loading-round-two";
  pressedKeys.clear();
  resetTouchInput();
  mouseDragging = false;
  player.velocity.set(0, 0, 0);
  player.targetVelocity.set(0, 0, 0);
  playAnimation("idle");
  document.exitPointerLock?.();
  roundLoading.hidden = false;
  roundLoading.classList.remove("is-error");
  roundLoadingStatus.textContent = "Đang chuẩn bị Forest Guardian…";
  roundLoadingRetry.hidden = true;
  roundLoadingRetry.disabled = true;

  try {
    await loadForestGuardian();
    if (gameState !== "loading-round-two") return;
    roundLoading.hidden = true;
    gameState = "playing";
    beginVictoryTransformation();
  } catch (error) {
    if (gameState !== "loading-round-two") return;
    console.error("Không tải được Forest Guardian Mecha", error);
    roundLoading.classList.add("is-error");
    roundLoadingStatus.textContent =
      "Chưa tải được Forest Guardian. Kiểm tra kết nối và thử lại.";
    roundLoadingRetry.hidden = false;
    roundLoadingRetry.disabled = false;
    roundLoadingRetry.focus();
  }
}

function swapToTransformedRobot() {
  if (!victoryTransformation || victoryTransformation.swapped) return;
  victoryTransformation.swapped = true;
  victoryFlash.classList.remove("is-active");
  void victoryFlash.offsetWidth;
  victoryFlash.classList.add("is-active");

  if (player.model) player.model.visible = false;
  if (player.transformedModel) {
    player.transformedModel.visible = true;
    player.transformedModel.position.copy(player.transformedBasePosition);
    player.transformedModel.position.y -= 0.08;
    player.transformedModel.scale
      .copy(player.transformedBaseScale)
      .multiplyScalar(0.84);
    const idleAction = player.transformedActions.get("idle");
    idleAction?.reset().fadeIn(0.18).play();
    player.transformedActiveAction = idleAction ?? null;
    player.transformedActiveState = idleAction ? "idle" : "";
  }
  transformedCore.visible = true;
  missionText.textContent = "Forest Guardian đã thức tỉnh";
}

function updateVictoryTransformation(deltaTime) {
  if (!victoryTransformation) return;
  victoryTransformation.time += deltaTime;
  const time = victoryTransformation.time;
  const progress = THREE.MathUtils.clamp(
    time / VICTORY_TRANSFORM_DURATION,
    0,
    1,
  );
  const charge = smoothProgress(time, 0.42, VICTORY_SWAP_TIME);
  const poseAmount = smoothProgress(time, 0.08, 1.15);
  const shake = charge * charge * 0.018;

  if (!victoryTransformation.swapped && player.model) {
    for (const { bone, base, degrees } of victoryTransformation.bones) {
      const delta = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          THREE.MathUtils.degToRad(degrees[0] * poseAmount),
          THREE.MathUtils.degToRad(degrees[1] * poseAmount),
          THREE.MathUtils.degToRad(degrees[2] * poseAmount),
          "XYZ",
        ),
      );
      bone.quaternion.copy(base).multiply(delta);
    }
    player.model.position.copy(player.modelBasePosition);
    player.model.position.y -= poseAmount * 0.12;
    player.model.scale
      .copy(player.modelBaseScale)
      .multiplyScalar(1 + charge * 0.035);
    player.model.quaternion.copy(player.modelBaseQuaternion);
    player.model.rotateZ(Math.sin(time * 52) * shake);

    for (const state of victoryTransformation.materials) {
      state.material.emissive.copy(state.emissive).lerp(ENERGY_COLOR, charge);
      state.material.emissiveIntensity =
        state.emissiveIntensity + charge * charge * 3.6;
    }
  }

  const fxFade = victoryTransformation.swapped
    ? 1 - smoothProgress(time, VICTORY_SWAP_TIME + 0.18, VICTORY_TRANSFORM_DURATION)
    : 1;
  const fxStrength = charge * fxFade;
  const { rings, shell, particles, light } = victoryTransformationFx.userData;
  victoryTransformationFx.rotation.y += deltaTime * (1.5 + charge * 4.5);
  rings.forEach((ring, index) => {
    ring.rotation.z += deltaTime * (index % 2 === 0 ? 1.8 : -2.2);
    ring.material.opacity = fxStrength * (0.32 + index * 0.12);
    const pulse = 0.76 + charge * 0.42 + Math.sin(time * 8 + index) * 0.05;
    ring.scale.setScalar(pulse);
  });
  shell.material.opacity = fxStrength * 0.16;
  shell.rotation.y -= deltaTime * 1.8;
  shell.scale.setScalar(0.82 + charge * 0.34);
  shell.scale.y *= 1.45;
  particles.material.opacity = fxStrength * 0.9;
  particles.rotation.y += deltaTime * (2.2 + charge * 4.2);
  particles.position.y = -0.18 + Math.sin(time * 5) * 0.08;
  light.intensity = fxStrength * 5.5;

  if (time >= VICTORY_SWAP_TIME) swapToTransformedRobot();
  if (victoryTransformation.swapped && player.transformedModel) {
    const reveal = smoothProgress(time, VICTORY_SWAP_TIME, VICTORY_SWAP_TIME + 0.58);
    player.transformedModel.scale
      .copy(player.transformedBaseScale)
      .multiplyScalar(0.84 + reveal * 0.16);
    player.transformedModel.position.copy(player.transformedBasePosition);
    player.transformedModel.position.y -= (1 - reveal) * 0.08;
    player.transformedMixer?.update(deltaTime);
    const pulse = 1 + Math.sin(time * 6) * 0.08;
    transformedCore.userData.halo.scale.setScalar(pulse);
    transformedCore.userData.core.rotation.y += deltaTime * 1.8;
    transformedCore.userData.light.intensity = 2.6 + Math.sin(time * 7) * 0.45;
  }

  yaw += deltaTime * (0.18 + (1 - progress) * 0.08);
  flatForward.set(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
  cameraRight.set(-flatForward.z, 0, flatForward.x).normalize();

  if (time < VICTORY_TRANSFORM_DURATION) return;
  victoryTransformationFx.visible = false;
  beginRoundTwo();
}

function resetRoundObjects() {
  for (const core of energyCores) {
    core.visible = true;
    core.userData.collected = false;
  }
  hunters.forEach((hunter) => {
    hunter.position.x = hunter.userData.anchor.x;
    hunter.position.z = hunter.userData.anchor.z;
    hunter.rotation.set(0, 0, 0);
    hunter.userData.attackTime = 0;
    hunter.userData.attackCooldown = 0.35;
    hunter.userData.attackDidDamage = false;
    hunter.userData.chasing = false;
    hunter.visible = true;
    if (hunter.userData.visualRig) {
      hunter.userData.visualRig.position.set(0, 0, 0);
      hunter.userData.visualRig.rotation.set(0, 0, 0);
    }
  });
}

function usesTouchControls() {
  return touchLayoutQuery.matches;
}

function requestGamePointerLock() {
  if (!usesTouchControls() && !pauseMenu.open) {
    canvas.requestPointerLock?.()?.catch?.(() => {
      // Sau khi thoát bằng Esc, trình duyệt có thể yêu cầu click lại canvas.
    });
  }
}

function openPauseMenu() {
  if (pauseMenu.open) return;
  pressedKeys.clear();
  resetTouchInput();
  mouseDragging = false;
  setMobileSettingsOpen(false);
  resumeButton.textContent =
    gameState === "playing" || gameState === "transforming"
      ? "Tiếp tục chơi"
      : "Đóng menu";
  pauseMenu.showModal();
  if (document.pointerLockElement === canvas) document.exitPointerLock?.();
  for (const pool of soundPools.values()) {
    for (const voice of pool) voice.pause();
  }
}

function closePauseMenu(restorePointerLock = false) {
  if (!pauseMenu.open) return;
  pauseMenu.close();
  pressedKeys.clear();
  resetTouchInput();
  if (restorePointerLock && gameState === "playing") requestGamePointerLock();
}

function resetTouchInput() {
  touchMovement.set(0, 0);
  touchSprintPressed = false;
  touchJumpPressed = false;
  joystickPointerId = null;
  lookPointerId = null;
  mobileJoystickStick.style.transform = "translate(0px, 0px)";
  mobileSprintAction.classList.remove("is-active");
  mobileJumpAction.classList.remove("is-active");
}

function beginRoundTwo() {
  if (victoryTransformation?.bones) {
    for (const { bone, base } of victoryTransformation.bones) {
      bone.quaternion.copy(base);
    }
  }
  if (victoryTransformation?.materials) {
    for (const state of victoryTransformation.materials) {
      state.material.emissive.copy(state.emissive);
      state.material.emissiveIntensity = state.emissiveIntensity;
    }
  }
  victoryTransformation = null;
  currentRound = 2;
  gameState = "playing";
  collectedCores = 0;
  timeRemaining = ROUND_DURATION;
  health = 100;
  stamina = 100;
  sprintExhausted = false;
  damageCooldown = 0;
  beaconStillTime = 0;
  wasInsideBeacon = false;
  player.velocity.set(0, 0, 0);
  player.targetVelocity.set(0, 0, 0);
  player.verticalVelocity = 0;
  player.jumpHeight = 0;
  player.grounded = true;
  player.mixer?.stopAllAction();
  if (player.model) player.model.visible = false;
  if (player.transformedModel) {
    player.transformedModel.visible = cameraMode === "third";
    player.transformedModel.position.copy(player.transformedBasePosition);
    player.transformedModel.scale.copy(player.transformedBaseScale);
  }
  transformedCore.visible = true;
  player.transformedMixer?.stopAllAction();
  player.transformedActiveAction = null;
  player.transformedActiveState = "";
  playAnimation("idle");
  playerMarker.visible = cameraMode === "third";
  targetThirdPersonDistance = THIRD_PERSON_DISTANCE;
  cameraModeElement.textContent = "THIRD PERSON";
  timerElement.parentElement.classList.remove("is-urgent");
  roundLabel.textContent = "Vòng 2 · Forest Guardian";
  missionText.textContent = "Thu thập 6 lõi bằng hình dạng mới";
  resetRoundObjects();
  updateSpatialCulling(0, true);
  updateHud();
  requestGamePointerLock();
  showToast("Vòng 2 — dùng Forest Guardian thu thập năng lượng!");
}

function resetGame() {
  roundLoading.hidden = true;
  currentRound = 1;
  randomizeWeather();
  restoreVictoryVisuals();
  health = 100;
  stamina = 100;
  sprintExhausted = false;
  collectedCores = 0;
  timeRemaining = ROUND_DURATION;
  elapsedTime = 0;
  damageCooldown = 0;
  monsterSoundCooldown = 0;
  footstepCooldown = 0.08;
  footstepIndex = 0;
  beaconStillTime = 0;
  wasInsideBeacon = false;
  cameraMode = "third";
  resetTouchInput();
  yaw = 0;
  pitch = 0.12;
  thirdPersonDistance = THIRD_PERSON_DISTANCE;
  targetThirdPersonDistance = THIRD_PERSON_DISTANCE;
  flatForward.set(0, 0, -1);
  player.velocity.set(0, 0, 0);
  player.targetVelocity.set(0, 0, 0);
  player.verticalVelocity = 0;
  player.jumpHeight = 0;
  player.grounded = true;
  playerRoot.position.set(
    SPAWN_X,
    gameplayGroundHeight(SPAWN_X, SPAWN_Z),
    SPAWN_Z,
  );
  playerRoot.quaternion.identity();
  playerMarker.visible = true;
  if (player.model) player.model.visible = true;

  resetRoundObjects();
  grass.userData.update?.(0, elapsedTime, playerRoot.position, true);
  flowerGarden.userData.update?.(0, elapsedTime, playerRoot.position, true);
  butterflies.userData.update?.(0, elapsedTime, playerRoot.position, true);
  fireflies.userData.update?.(0, elapsedTime, playerRoot.position, true);
  updateSpatialCulling(0, true);

  roundLabel.textContent = "Vòng 1 · Thu hồi năng lượng";
  missionText.textContent = "Thu thập 6 lõi năng lượng";
  cameraModeElement.textContent = "THIRD PERSON";
  updateMobileCameraLabels();
  timerElement.parentElement.classList.remove("is-urgent");
  resultModal.classList.remove("is-visible");
  updateHud();
}

function startGame() {
  if (!assetsReady) return;
  resetGame();
  gameState = "playing";
  startForestAmbience();
  startModal.classList.remove("is-visible");
  resultModal.classList.remove("is-visible");
  requestGamePointerLock();
  showToast("Tìm các tín hiệu màu xanh trong rừng");
  // Start the round-two download only after the user can play round one.
  void loadForestGuardian().catch((error) => {
    console.warn("Forest Guardian sẽ được tải lại khi chuyển vòng", error);
  });
}

function finishGame(won, reason = "") {
  if (gameState !== "playing") return;
  if (won && currentRound === 1) {
    beginVictoryTransformation();
    return;
  }

  gameState = won ? "won" : "lost";
  pressedKeys.clear();
  resetTouchInput();
  player.velocity.set(0, 0, 0);
  player.targetVelocity.set(0, 0, 0);
  playAnimation("idle");
  document.exitPointerLock?.();
  showGameResult(won, reason, elapsedTime);
}

function showGameResult(won, reason = "", resultTime = elapsedTime) {
  const resultIcon = document.querySelector("#result-icon");
  resultIcon.textContent = won ? "✓" : "×";
  resultIcon.classList.toggle("is-failure", !won);
  document.querySelector("#result-eyebrow").textContent = won ? "Mission complete" : "Mission failed";
  document.querySelector("#result-title").textContent = won
    ? "Hai vòng đã hoàn tất."
    : reason === "health"
      ? "Bóng tối đã bắt kịp bạn."
      : "Hoàng hôn đã buông xuống.";
  document.querySelector("#result-copy").textContent = won
    ? "Forest Guardian đã thu hồi trọn vẹn nguồn năng lượng của khu rừng."
    : "Rừng vẫn còn ở đó. Điều chỉnh lộ trình và thử lại nhiệm vụ.";
  document.querySelector("#result-time").textContent = formatTime(resultTime, false);
  document.querySelector("#result-cores").textContent = `${collectedCores} / ${TOTAL_CORES}`;
  resultModal.classList.add("is-visible");
}

function showToast(message) {
  toastElement.textContent = message;
  toastElement.classList.add("is-visible");
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => toastElement.classList.remove("is-visible"), 2200);
}

function setWeather(mode, { announce = true } = {}) {
  if (!WEATHER_PRESETS[mode]) return;
  currentWeather = mode;
  const preset = WEATHER_PRESETS[currentWeather];
  weatherEffects.userData.setMode(currentWeather);
  grass.userData.setWeatherTint?.(
    preset.grassTint,
    preset.grassTintAmount,
  );
  if (terrain.material?.color) terrain.material.color.set(preset.terrainTint);
  sunDisc.visible = currentWeather === "sunny";
  butterflies.visible = currentWeather === "sunny";
  weatherIcon.textContent = preset.icon;
  weatherLabel.textContent = preset.label;
  weatherSelect.value = currentWeather;
  weatherCycleButton.setAttribute(
    "aria-label",
    `Đổi thời tiết, hiện tại ${preset.label}`,
  );
  if (announce) showToast(`Thời tiết · ${preset.label}`);
}

function cycleWeather() {
  const currentIndex = WEATHER_ORDER.indexOf(currentWeather);
  setWeather(WEATHER_ORDER[(currentIndex + 1) % WEATHER_ORDER.length]);
}

function randomizeWeather() {
  const index = Math.floor(Math.random() * WEATHER_ORDER.length);
  setWeather(WEATHER_ORDER[index], { announce: false });
}

function formatTime(seconds, ceiling = true) {
  const safeSeconds = Math.max(0, ceiling ? Math.ceil(seconds) : Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

function updateHud() {
  healthMeter.style.width = `${health}%`;
  healthValue.textContent = Math.ceil(health);
  staminaMeter.style.width = `${stamina}%`;
  staminaValue.textContent = Math.ceil(stamina);
  coreCount.textContent = `${collectedCores} / ${TOTAL_CORES}`;
  timerElement.textContent = formatTime(timeRemaining);
}

function updateMobileCameraLabels() {
  const label = cameraMode === "third" ? "Third person" : "First person";
  mobileCameraSetting.textContent = `Camera · ${label}`;
  mobileCameraAction.setAttribute("aria-label", `Đổi camera, hiện tại ${label}`);
}

function toggleCameraMode() {
  cameraMode = cameraMode === "third" ? "first" : "third";
  cameraModeElement.textContent = cameraMode === "third" ? "THIRD PERSON" : "FIRST PERSON";
  playerMarker.visible = cameraMode === "third";
  if (player.model) {
    player.model.visible = currentRound === 1 && cameraMode === "third";
  }
  if (player.transformedModel) {
    player.transformedModel.visible = currentRound === 2 && cameraMode === "third";
  }
  transformedCore.visible = currentRound === 2 && cameraMode === "third";
  pitch = THREE.MathUtils.clamp(
    pitch,
    cameraMode === "first" ? -1.05 : -0.3,
    cameraMode === "first" ? 1.05 : 0.68,
  );
  updateMobileCameraLabels();
  showToast(cameraMode === "third" ? "Camera thứ ba" : "Camera thứ nhất");
}

function resolveWorldCollisions() {
  for (const collider of worldColliders) {
    const dx = playerRoot.position.x - collider.x;
    const dz = playerRoot.position.z - collider.z;
    const minimumDistance = PLAYER_RADIUS + collider.radius;
    const distanceSquared = dx * dx + dz * dz;
    if (distanceSquared >= minimumDistance * minimumDistance) continue;
    const distance = Math.sqrt(distanceSquared);
    if (distance < 0.0001) {
      playerRoot.position.x += minimumDistance;
    } else {
      const correction = (minimumDistance - distance) / distance;
      playerRoot.position.x += dx * correction;
      playerRoot.position.z += dz * correction;
    }
  }
}

function preventCameraOcclusion(target, desired) {
  const rayX = desired.x - target.x;
  const rayZ = desired.z - target.z;
  const rayLengthSquared = rayX * rayX + rayZ * rayZ;
  const rayLength = Math.sqrt(rayLengthSquared);
  let allowedAmount = 1;

  for (const tree of treeColliders) {
    const amount = THREE.MathUtils.clamp(
      ((tree.x - target.x) * rayX + (tree.z - target.z) * rayZ) / rayLengthSquared,
      0,
      1,
    );
    if (amount < 0.18 || amount >= allowedAmount) continue;
    const closestX = target.x + rayX * amount;
    const closestZ = target.z + rayZ * amount;
    if (Math.hypot(tree.x - closestX, tree.z - closestZ) >= tree.cameraRadius) continue;
    allowedAmount = Math.min(allowedAmount, Math.max(0.22, amount - (tree.cameraRadius + 0.45) / rayLength));
  }

  if (allowedAmount < 1) {
    desired.lerpVectors(target, desired, allowedAmount);
    desired.y += 0.45;
  }
}

function updatePlayer(deltaTime) {
  flatForward.set(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
  cameraRight.set(-flatForward.z, 0, flatForward.x).normalize();
  const keyboardForwardInput =
    (pressedKeys.has("KeyW") || pressedKeys.has("ArrowUp") ? 1 : 0) -
    (pressedKeys.has("KeyS") || pressedKeys.has("ArrowDown") ? 1 : 0);
  const keyboardRightInput =
    (pressedKeys.has("KeyD") || pressedKeys.has("ArrowRight") ? 1 : 0) -
    (pressedKeys.has("KeyA") || pressedKeys.has("ArrowLeft") ? 1 : 0);
  const forwardInput = THREE.MathUtils.clamp(
    keyboardForwardInput - touchMovement.y,
    -1,
    1,
  );
  const rightInput = THREE.MathUtils.clamp(
    keyboardRightInput + touchMovement.x,
    -1,
    1,
  );
  const inputAmount = Math.min(1, Math.hypot(forwardInput, rightInput));
  moveDirection.copy(flatForward).multiplyScalar(forwardInput).addScaledVector(cameraRight, rightInput);

  const moving = moveDirection.lengthSq() > 0;
  const wantsToRun =
    touchSprintPressed ||
    pressedKeys.has("ShiftLeft") ||
    pressedKeys.has("ShiftRight");

  // Không cho sprint bật/tắt liên tục quanh mức stamina = 0. Việc đổi qua lại
  // mỗi frame trước đây làm tốc độ và animation dao động, nhìn như camera shake.
  // Sau khi kiệt sức, player giữ tốc độ đi bộ cho tới khi nhả Shift và hồi đủ.
  if (sprintExhausted && !wantsToRun && stamina >= 20) {
    sprintExhausted = false;
  }
  const running = moving && wantsToRun && !sprintExhausted;
  if (moving) moveDirection.normalize();

  if (running) {
    stamina = Math.max(0, stamina - 24 * deltaTime);
    if (stamina <= 0) {
      sprintExhausted = true;
      showToast("Đã kiệt sức — nhả Shift để hồi phục");
    }
  } else {
    stamina = Math.min(100, stamina + (moving ? 10 : 17) * deltaTime);
  }

  const walkSpeed =
    currentRound === 2 ? FOREST_GUARDIAN_WALK_SPEED : PLAYER_WALK_SPEED;
  const sprintSpeed =
    currentRound === 2 ? FOREST_GUARDIAN_SPRINT_SPEED : PLAYER_SPRINT_SPEED;
  const targetSpeed = moving
    ? (running ? sprintSpeed : walkSpeed) * inputAmount
    : 0;
  player.targetVelocity.copy(moveDirection).multiplyScalar(targetSpeed);
  player.velocity.lerp(player.targetVelocity, 1 - Math.exp(-(moving ? 8 : 11) * deltaTime));
  if (!moving && player.velocity.lengthSq() < 0.0004) player.velocity.set(0, 0, 0);

  playerRoot.position.addScaledVector(player.velocity, deltaTime);
  playerRoot.position.x = THREE.MathUtils.clamp(
    playerRoot.position.x,
    -GAME_HALF_WORLD + 1.2,
    GAME_HALF_WORLD - 1.2,
  );
  playerRoot.position.z = THREE.MathUtils.clamp(
    playerRoot.position.z,
    -GAME_HALF_WORLD + 1.2,
    GAME_HALF_WORLD - 1.2,
  );
  resolveWorldCollisions();

  if (moving) {
    targetFacing.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(moveDirection.x, moveDirection.z));
    playerRoot.quaternion.slerp(targetFacing, 1 - Math.exp(-13 * deltaTime));
  }

  const jumpPressed = touchJumpPressed || pressedKeys.has("Space");
  if (jumpPressed && !jumpWasPressed && player.grounded) {
    player.verticalVelocity = 5.6;
    player.grounded = false;
  }
  jumpWasPressed = jumpPressed;
  if (!player.grounded) {
    player.verticalVelocity -= 15.5 * deltaTime;
    player.jumpHeight += player.verticalVelocity * deltaTime;
    if (player.jumpHeight <= 0) {
      player.jumpHeight = 0;
      player.verticalVelocity = 0;
      player.grounded = true;
    }
  }

  playerRoot.position.y =
    gameplayGroundHeight(playerRoot.position.x, playerRoot.position.z) +
    player.jumpHeight;
  updateMovementSounds(deltaTime, running);
  playAnimation(
    !player.grounded ? "jump" : player.velocity.length() > 0.12 ? (running ? "run" : "walk") : "idle",
  );
}

function updateCamera(deltaTime) {
  if (cameraMode === "first") {
    const cosPitch = Math.cos(pitch);
    lookDirection.set(-Math.sin(yaw) * cosPitch, Math.sin(pitch), -Math.cos(yaw) * cosPitch);
    camera.position.set(playerRoot.position.x, playerRoot.position.y + 1.78, playerRoot.position.z);
    cameraTarget.copy(camera.position).add(lookDirection);
    camera.lookAt(cameraTarget);
  } else {
    thirdPersonDistance = THREE.MathUtils.lerp(
      thirdPersonDistance,
      targetThirdPersonDistance,
      1 - Math.exp(-12 * deltaTime),
    );
    const horizontalDistance = Math.cos(pitch) * thirdPersonDistance;
    cameraTarget.set(playerRoot.position.x, playerRoot.position.y + 1.25, playerRoot.position.z);
    desiredCamera
      .copy(cameraTarget)
      .addScaledVector(flatForward, -horizontalDistance)
      .addScaledVector(cameraRight, THIRD_PERSON_SHOULDER_OFFSET);
    desiredCamera.y +=
      THIRD_PERSON_BASE_HEIGHT + Math.sin(pitch) * thirdPersonDistance;
    preventCameraOcclusion(cameraTarget, desiredCamera);
    camera.position.lerp(desiredCamera, 1 - Math.exp(-9 * deltaTime));
    camera.lookAt(cameraTarget);
  }
}

function updateCores(deltaTime) {
  for (const core of energyCores) {
    if (core.userData.collected) continue;
    core.rotation.y += deltaTime * 0.8;
    core.userData.crystal.rotation.x += deltaTime * 0.9;
    core.userData.orbit.rotation.z += deltaTime * 1.35;
    core.position.y = core.userData.baseY + Math.sin(elapsedTime * 2 + core.userData.index) * 0.13;

    if (gameState !== "playing") continue;
    const distance = Math.hypot(playerRoot.position.x - core.position.x, playerRoot.position.z - core.position.z);
    if (distance > 1.25) continue;
    core.userData.collected = true;
    core.visible = false;
    collectedCores += 1;
    playGameSound("energyHarvest", {
      volume: 0.66,
      playbackRate: 0.96 + collectedCores * 0.018,
    });
    if (collectedCores === TOTAL_CORES) {
      if (currentRound === 1) {
        missionText.textContent = "Quay về vùng sáng của UFO beacon";
        showToast("Đủ năng lượng — quay về UFO beacon!");
      } else {
        missionText.textContent = "Năng lượng vòng 2 đã hoàn tất";
        showToast("Forest Guardian đã thu hồi đủ năng lượng!");
        finishGame(true);
      }
    } else {
      missionText.textContent = `Còn ${TOTAL_CORES - collectedCores} lõi năng lượng`;
      showToast(`Đã thu hồi lõi ${collectedCores}/${TOTAL_CORES}`);
    }
  }
}

function updateSpatialCulling(deltaTime, force = false) {
  environmentCullElapsed += deltaTime;
  if (!force && environmentCullElapsed < ENVIRONMENT_CULL_INTERVAL) return;
  environmentCullElapsed = 0;

  const updateCollection = (collection, renderDistance, shadowDistance = 0) => {
    collection.traverse((object) => {
      const chunk = object.userData.spatialChunk;
      if (!chunk) return;
      const distance = Math.hypot(
        playerRoot.position.x - chunk.centerX,
        playerRoot.position.z - chunk.centerZ,
      );
      object.visible = distance <= renderDistance + chunk.radius;
      object.castShadow =
        object.visible && shadowDistance > 0 && distance <= shadowDistance + chunk.radius;
    });
  };

  updateCollection(trees, TREE_RENDER_DISTANCE, TREE_SHADOW_DISTANCE);
}

function keepHunterOutsideUfoLight(hunter) {
  let offsetX = hunter.position.x - SPAWN_X;
  let offsetZ = hunter.position.z - SPAWN_Z;
  let distance = Math.hypot(offsetX, offsetZ);
  if (distance >= UFO_HUNTER_EXCLUSION_RADIUS) return false;

  if (distance < 0.001) {
    const angle = hunter.userData.phase ?? 0;
    offsetX = Math.cos(angle);
    offsetZ = Math.sin(angle);
    distance = 1;
  }
  const scale = UFO_HUNTER_EXCLUSION_RADIUS / distance;
  hunter.position.x = SPAWN_X + offsetX * scale;
  hunter.position.z = SPAWN_Z + offsetZ * scale;
  hunter.userData.attackTime = 0;
  hunter.userData.attackDidDamage = false;
  return true;
}

function updateHunters(deltaTime) {
  damageCooldown = Math.max(0, damageCooldown - deltaTime);
  monsterSoundCooldown = Math.max(0, monsterSoundCooldown - deltaTime);
  const playerInsideUfoLight =
    Math.hypot(
      playerRoot.position.x - SPAWN_X,
      playerRoot.position.z - SPAWN_Z,
    ) < UFO_PLAYER_SAFE_RADIUS;
  hunters.forEach((hunter) => {
    const data = hunter.userData;
    keepHunterOutsideUfoLight(hunter);
    const distanceToPlayer = Math.hypot(
      playerRoot.position.x - hunter.position.x,
      playerRoot.position.z - hunter.position.z,
    );

    // Bỏ hoàn toàn model/skinning khi Bóng Săn đã nằm sâu trong sương mù.
    // Khoảng cách vẫn được kiểm tra để nó hiện lại ngay khi người chơi tới gần.
    hunter.visible = distanceToPlayer <= HUNTER_RENDER_DISTANCE;
    if (!hunter.visible) {
      data.chasing = false;
      data.attackTime = 0;
      data.attackDidDamage = false;
      return;
    }

    if (gameState !== "playing" || playerInsideUfoLight) {
      data.chasing = false;
      data.attackTime = 0;
      data.attackDidDamage = false;
    } else if (data.chasing) {
      data.chasing = distanceToPlayer <= HUNTER_STOP_CHASE_DISTANCE;
    } else {
      data.chasing = distanceToPlayer < HUNTER_CHASE_DISTANCE;
    }

    if (!data.chasing && distanceToPlayer > HUNTER_STOP_CHASE_DISTANCE) {
      data.attackTime = 0;
      data.attackDidDamage = false;
    }

    // Ngoài vùng này, giữ nguyên pose và bỏ qua toàn bộ animation xương/cánh.
    if (distanceToPlayer > HUNTER_ANIMATION_DISTANCE && !data.chasing) return;

    data.attackCooldown = Math.max(0, data.attackCooldown - deltaTime);
    if (
      data.chasing &&
      distanceToPlayer < 2.8 &&
      data.attackTime <= 0 &&
      data.attackCooldown <= 0
    ) {
      data.attackTime = 0.78;
      data.attackDidDamage = false;
      if (monsterSoundCooldown <= 0) {
        playGameSound("monsterAttack", {
          volume: 0.72,
          playbackRate: 0.92 + (Math.sin(data.phase) + 1) * 0.045,
        });
        monsterSoundCooldown = 0.48;
      }
    }

    const attacking = data.attackTime > 0;
    let attackProgress = 0;
    if (attacking) {
      data.attackTime = Math.max(0, data.attackTime - deltaTime);
      attackProgress = 1 - data.attackTime / 0.78;
      if (data.attackTime === 0) data.attackCooldown = 2.1;
    }

    hunterDirection.set(
      playerRoot.position.x - hunter.position.x,
      0,
      playerRoot.position.z - hunter.position.z,
    );
    const targetDistance = hunterDirection.length();
    if (data.chasing && targetDistance > 0.15) {
      hunterDirection.normalize();
      const speed = attacking ? data.speed + 3.5 : data.speed + 0.72;
      hunter.position.addScaledVector(hunterDirection, speed * deltaTime);
      keepHunterOutsideUfoLight(hunter);
      const desiredYaw = Math.atan2(hunterDirection.x, hunterDirection.z) + Math.PI;
      const yawDifference = Math.atan2(
        Math.sin(desiredYaw - hunter.rotation.y),
        Math.cos(desiredYaw - hunter.rotation.y),
      );
      hunter.rotation.y += yawDifference * (1 - Math.exp(-7 * deltaTime));
      hunter.rotation.z = THREE.MathUtils.lerp(
        hunter.rotation.z,
        THREE.MathUtils.clamp(-yawDifference * 0.42, -0.34, 0.34),
        1 - Math.exp(-5 * deltaTime),
      );
    } else {
      hunter.rotation.z = THREE.MathUtils.lerp(
        hunter.rotation.z,
        0,
        1 - Math.exp(-5 * deltaTime),
      );
    }

    const groundY = terrainHeight(hunter.position.x, hunter.position.z);
    const dive = attacking ? Math.sin(attackProgress * Math.PI) * 0.5 : 0;
    hunter.position.y =
      groundY + 1.62 + Math.sin(elapsedTime * 2.7 + data.phase) * 0.18 - dive;

    const flapSpeed = attacking ? 13.5 : data.chasing ? 8.2 : 5.4;
    const flapAmount = attacking ? 0.95 : data.chasing ? 0.72 : 0.5;
    const wingPhase = elapsedTime * flapSpeed + data.phase;
    const rawFlap = Math.sin(wingPhase) + Math.sin(wingPhase * 2 - 0.5) * 0.12;
    const flapWave = rawFlap >= 0 ? rawFlap : rawFlap * 0.42;
    const flap = flapWave * flapAmount;
    data.leftWing.rotation.z = flap;
    data.rightWing.rotation.z = -flap;

    if (data.wingBones?.length) {
      for (const bones of data.wingBones) {
        const phase = wingPhase - bones.lag;
        const rawBoneFlap = Math.sin(phase) + Math.sin(phase * 2 - 0.5) * 0.12;
        const boneWave = rawBoneFlap >= 0 ? rawBoneFlap : rawBoneFlap * 0.42;
        const boneFlap = THREE.MathUtils.clamp(
          bones.downBias + boneWave * flapAmount * bones.amount,
          -0.34,
          1.18,
        );
        const twist = Math.sin(phase - Math.PI * 0.4) * flapAmount * bones.twist;
        bones.leftFlap.setFromAxisAngle(hunterWingAxis, boneFlap);
        bones.rightFlap.setFromAxisAngle(hunterWingAxis, -boneFlap);
        bones.leftTwist.setFromAxisAngle(hunterWingTwistAxis, twist);
        bones.rightTwist.setFromAxisAngle(hunterWingTwistAxis, twist);
        bones.left.quaternion
          .copy(bones.leftBase)
          .multiply(bones.leftFlap)
          .multiply(bones.leftTwist);
        bones.right.quaternion
          .copy(bones.rightBase)
          .multiply(bones.rightFlap)
          .multiply(bones.rightTwist);
      }
    }

    if (data.visualRig) {
      const strike = attacking ? Math.sin(attackProgress * Math.PI) : 0;
      data.visualRig.rotation.x = strike * 0.1;
      data.visualRig.rotation.z = Math.sin(elapsedTime * 2.4 + data.phase) * 0.035;
      data.visualRig.position.z = -strike * 0.42;
    }

    const strikeDistance = Math.hypot(
      playerRoot.position.x - hunter.position.x,
      playerRoot.position.z - hunter.position.z,
    );
    if (
      gameState !== "playing" ||
      !attacking ||
      attackProgress < 0.32 ||
      attackProgress > 0.82 ||
      data.attackDidDamage ||
      strikeDistance > 1.5 ||
      damageCooldown > 0
    ) return;

    data.attackDidDamage = true;
    damageCooldown = 1.15;
    health = Math.max(0, health - 18);
    const knockback = hunterDirection.clone().multiplyScalar(-1.25);
    playerRoot.position.add(knockback);
    damageFlash.classList.remove("is-active");
    void damageFlash.offsetWidth;
    damageFlash.classList.add("is-active");
    showToast("Bị bóng săn tấn công — hãy chạy!");
    if (health <= 0) finishGame(false, "health");
  });
}

function updateBeacon(deltaTime) {
  const active = currentRound === 1 && collectedCores === TOTAL_CORES;
  const {
    ring,
    column,
    light,
    ufo,
    rim: ufoRim,
    emitter,
    signalLights,
  } = beacon.userData;
  ring.rotation.z += deltaTime * (active ? 1.3 : 0.35);
  ufo.rotation.y += deltaTime * (active ? 0.72 : 0.24);
  ufo.position.y =
    UFO_BEACON_HOVER_HEIGHT + Math.sin(elapsedTime * 1.35) * 0.14;
  light.position.y = ufo.position.y - 0.42;
  ring.material.opacity = active ? 0.72 + Math.sin(elapsedTime * 4) * 0.16 : 0.42;
  column.material.opacity = active ? 0.13 + Math.sin(elapsedTime * 3) * 0.035 : 0.045;
  light.intensity = active ? 24 : 7;
  const ufoPulse = 1 + Math.sin(elapsedTime * (active ? 6.5 : 3.2)) * 0.08;
  ufoRim.scale.setScalar(ufoPulse);
  emitter.scale.y = active ? 1 + Math.sin(elapsedTime * 5) * 0.14 : 1;
  signalLights.forEach((signalLight, index) => {
    const signalPulse =
      0.78 +
      Math.max(0, Math.sin(elapsedTime * 4.2 - index * 0.72)) *
        (active ? 0.58 : 0.26);
    signalLight.scale.setScalar(signalPulse);
  });

  if (gameState !== "playing" || !active) {
    beaconStillTime = 0;
    wasInsideBeacon = false;
    ring.scale.setScalar(1);
    return;
  }
  const distance = Math.hypot(playerRoot.position.x - SPAWN_X, playerRoot.position.z - SPAWN_Z);
  const insideBeacon = distance < 1.58;
  if (!insideBeacon) {
    beaconStillTime = 0;
    wasInsideBeacon = false;
    ring.scale.setScalar(1);
    missionText.textContent = "Quay về vùng sáng của UFO beacon";
    return;
  }

  if (!wasInsideBeacon) {
    wasInsideBeacon = true;
    showToast("Đã vào UFO beacon — đứng yên để đồng bộ năng lượng");
  }

  const standingStill =
    player.grounded &&
    player.velocity.lengthSq() < 0.0064 &&
    player.targetVelocity.lengthSq() < 0.0064;
  if (!standingStill) {
    beaconStillTime = 0;
    ring.scale.setScalar(1);
    missionText.textContent = "Đứng yên trong vòng sáng để biến hình";
    return;
  }

  beaconStillTime = Math.min(
    BEACON_STILL_DURATION,
    beaconStillTime + deltaTime,
  );
  const stillProgress = beaconStillTime / BEACON_STILL_DURATION;
  ring.scale.setScalar(1 + Math.sin(stillProgress * Math.PI) * 0.13);
  missionText.textContent = `Đồng bộ năng lượng ${Math.round(stillProgress * 100)}%`;
  if (beaconStillTime >= BEACON_STILL_DURATION) finishGame(true);
}

const atmosphereDayColor = new THREE.Color();

function updateAtmosphere() {
  const dayAmount = THREE.MathUtils.clamp(timeRemaining / ROUND_DURATION, 0, 1);
  const preset = WEATHER_PRESETS[currentWeather];
  atmosphereDayColor.set(preset.fogDay);
  scene.fog.color.set(preset.fogNight).lerp(atmosphereDayColor, dayAmount);
  scene.fog.density = preset.fogDensity;
  scene.background.copy(scene.fog.color);
  hemisphere.color.set(preset.hemisphereSky);
  hemisphere.groundColor.set(preset.hemisphereGround);
  hemisphere.intensity =
    (1.25 + dayAmount) * preset.hemisphereStrength;
  sun.color.set(preset.sunColor);
  sun.intensity = (1.8 + dayAmount * 1.75) * preset.sunStrength;
  renderer.toneMappingExposure =
    0.76 + dayAmount * 0.27 + preset.exposureOffset;
}

function resizeMinimap() {
  const bounds = minimapCanvas.getBoundingClientRect();
  if (bounds.width < 1 || bounds.height < 1) return;
  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  const width = Math.round(bounds.width * pixelRatio);
  const height = Math.round(bounds.height * pixelRatio);
  if (minimapCanvas.width !== width || minimapCanvas.height !== height) {
    minimapCanvas.width = width;
    minimapCanvas.height = height;
  }
}

function setMinimapZoom(worldSpan) {
  minimapWorldSpan = THREE.MathUtils.clamp(worldSpan, 36, GAME_WORLD_SIZE);
  mapZoomLabel.textContent = `${(90 / minimapWorldSpan).toFixed(1)}×`;
  mapZoomInButton.disabled = minimapWorldSpan <= 36;
  mapZoomOutButton.disabled = minimapWorldSpan >= GAME_WORLD_SIZE;
  minimapElapsed = 1;
}

function updateMinimap(deltaTime, force = false) {
  if (!usesTouchControls()) return;
  minimapElapsed += deltaTime;
  if (!force && minimapElapsed < 0.08) return;
  minimapElapsed = 0;
  resizeMinimap();

  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  const width = minimapCanvas.width / pixelRatio;
  const height = minimapCanvas.height / pixelRatio;
  if (width < 1 || height < 1) return;

  const context = minimapContext;
  const scale = Math.min(width, height) / minimapWorldSpan;
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const toMap = (worldX, worldZ) => [
    centerX + (worldX - playerRoot.position.x) * scale,
    centerY + (worldZ - playerRoot.position.z) * scale,
  ];
  const drawMarker = (worldX, worldZ, radius, color) => {
    const [x, y] = toMap(worldX, worldZ);
    if (x < -radius || x > width + radius || y < -radius || y > height + radius) return;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
  };

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(5, 18, 12, 0.92)";
  context.fillRect(0, 0, width, height);
  context.save();
  context.beginPath();
  context.rect(0, 0, width, height);
  context.clip();

  context.strokeStyle = "rgba(215, 255, 103, 0.07)";
  context.lineWidth = 1;
  const gridStep = 10;
  const minimumX = playerRoot.position.x - minimapWorldSpan * 0.6;
  const maximumX = playerRoot.position.x + minimapWorldSpan * 0.6;
  const minimumZ = playerRoot.position.z - minimapWorldSpan * 0.6;
  const maximumZ = playerRoot.position.z + minimapWorldSpan * 0.6;
  for (let x = Math.floor(minimumX / gridStep) * gridStep; x <= maximumX; x += gridStep) {
    const [mapX] = toMap(x, playerRoot.position.z);
    context.beginPath();
    context.moveTo(mapX, 0);
    context.lineTo(mapX, height);
    context.stroke();
  }
  for (let z = Math.floor(minimumZ / gridStep) * gridStep; z <= maximumZ; z += gridStep) {
    const [, mapY] = toMap(playerRoot.position.x, z);
    context.beginPath();
    context.moveTo(0, mapY);
    context.lineTo(width, mapY);
    context.stroke();
  }

  context.beginPath();
  for (let index = 0; index <= 28; index += 1) {
    const z = minimumZ + ((maximumZ - minimumZ) * index) / 28;
    const [x, y] = toMap(pathCenterX(z), z);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.strokeStyle = "rgba(225, 211, 153, 0.34)";
  context.lineWidth = Math.max(2, scale * 1.5);
  context.stroke();

  const [beaconX, beaconY] = toMap(beacon.position.x, beacon.position.z);
  context.save();
  context.translate(beaconX, beaconY);
  context.rotate(Math.PI / 4);
  context.strokeStyle = "#d7ff67";
  context.lineWidth = 1.5;
  context.strokeRect(-4, -4, 8, 8);
  context.restore();

  drawMarker(ANCIENT_OAK_X, ANCIENT_OAK_Z, 4, "#e3b765");
  for (const core of energyCores) {
    if (!core.userData.collected) {
      drawMarker(core.position.x, core.position.z, 3.2, "#d7ff67");
    }
  }
  for (const hunter of hunters) {
    drawMarker(hunter.position.x, hunter.position.z, 3, "#ff665c");
  }

  context.save();
  context.translate(centerX, centerY);
  context.rotate(-playerRoot.rotation.y);
  context.beginPath();
  context.moveTo(0, 8);
  context.lineTo(-5.5, -5);
  context.lineTo(0, -2);
  context.lineTo(5.5, -5);
  context.closePath();
  context.fillStyle = "#ffffff";
  context.fill();
  context.strokeStyle = "#263b2d";
  context.lineWidth = 1;
  context.stroke();
  context.restore();

  context.fillStyle = "rgba(245, 240, 223, 0.65)";
  context.font = "700 8px Manrope, sans-serif";
  context.textAlign = "center";
  context.fillText("N", width * 0.5, 10);
  context.restore();
}

function onKeyDown(event) {
  if (event.code === "Escape") {
    event.preventDefault();
    if (event.repeat) return;
    if (pauseMenu.open) closePauseMenu();
    else openPauseMenu();
    return;
  }
  if (pauseMenu.open) return;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
  if (event.code === "KeyV" && !event.repeat && gameState === "playing") toggleCameraMode();
  if (gameState === "playing") pressedKeys.add(event.code);
}

function onMouseMove(event) {
  if (gameState !== "playing" || pauseMenu.open) return;
  const pointerLocked = document.pointerLockElement === canvas;
  if (!pointerLocked && !mouseDragging) return;
  yaw -= event.movementX * 0.0025;
  // Giữ số yaw nhỏ để người chơi có thể quay ngang liên tục nhiều vòng
  // mà không tích lũy sai số số học.
  if (Math.abs(yaw) > Math.PI * 2) yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  const verticalLookDelta =
    event.movementY * 0.002 * (cameraMode === "third" ? 1 : -1);
  pitch = THREE.MathUtils.clamp(
    pitch + verticalLookDelta,
    cameraMode === "first" ? -1.05 : -0.3,
    cameraMode === "first" ? 1.05 : 0.68,
  );
}

function onMouseWheel(event) {
  if (gameState !== "playing" || pauseMenu.open || cameraMode !== "third") return;
  event.preventDefault();
  const deltaPixels = event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? event.deltaY * 16
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? event.deltaY * window.innerHeight
      : event.deltaY;
  targetThirdPersonDistance = THREE.MathUtils.clamp(
    targetThirdPersonDistance + deltaPixels * THIRD_PERSON_ZOOM_SENSITIVITY,
    THIRD_PERSON_MIN_DISTANCE,
    THIRD_PERSON_MAX_DISTANCE,
  );
}

function updateJoystick(clientX, clientY) {
  const bounds = mobileJoystick.getBoundingClientRect();
  const centerX = bounds.left + bounds.width * 0.5;
  const centerY = bounds.top + bounds.height * 0.5;
  const maximumDistance = bounds.width * 0.31;
  const deltaX = clientX - centerX;
  const deltaY = clientY - centerY;
  const rawDistance = Math.hypot(deltaX, deltaY);
  const distance = Math.min(rawDistance, maximumDistance);
  const directionX = rawDistance > 0 ? deltaX / rawDistance : 0;
  const directionY = rawDistance > 0 ? deltaY / rawDistance : 0;
  const visualX = directionX * distance;
  const visualY = directionY * distance;
  const deadZone = 0.12;
  const amount = distance / maximumDistance;
  const normalizedAmount =
    amount <= deadZone ? 0 : (amount - deadZone) / (1 - deadZone);

  touchMovement.set(
    directionX * normalizedAmount,
    directionY * normalizedAmount,
  );
  mobileJoystickStick.style.transform = `translate(${visualX}px, ${visualY}px)`;
}

function capturePointer(element, pointerId) {
  try {
    element.setPointerCapture?.(pointerId);
  } catch {
    // Mobile Safari đôi khi hủy pointer capture ngay sau khi xoay màn hình.
  }
}

function onJoystickPointerDown(event) {
  if (event.pointerType === "mouse") return;
  event.preventDefault();
  joystickPointerId = event.pointerId;
  capturePointer(mobileJoystick, event.pointerId);
  updateJoystick(event.clientX, event.clientY);
}

function onJoystickPointerMove(event) {
  if (event.pointerId !== joystickPointerId) return;
  event.preventDefault();
  updateJoystick(event.clientX, event.clientY);
}

function onJoystickPointerUp(event) {
  if (event.pointerId !== joystickPointerId) return;
  joystickPointerId = null;
  touchMovement.set(0, 0);
  mobileJoystickStick.style.transform = "translate(0px, 0px)";
}

function onTouchLookStart(event) {
  if (
    event.pointerType === "mouse" ||
    !usesTouchControls() ||
    gameState !== "playing"
  ) {
    return;
  }
  event.preventDefault();
  lookPointerId = event.pointerId;
  lookPointerX = event.clientX;
  lookPointerY = event.clientY;
  capturePointer(canvas, event.pointerId);
}

function onTouchLookMove(event) {
  if (event.pointerId !== lookPointerId) return;
  event.preventDefault();
  const deltaX = event.clientX - lookPointerX;
  const deltaY = event.clientY - lookPointerY;
  lookPointerX = event.clientX;
  lookPointerY = event.clientY;

  yaw -= deltaX * 0.0052 * touchLookSensitivity;
  if (Math.abs(yaw) > Math.PI * 2) {
    yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  }
  const verticalLookDelta =
    deltaY *
    0.0042 *
    touchLookSensitivity *
    (cameraMode === "third" ? 1 : -1);
  pitch = THREE.MathUtils.clamp(
    pitch + verticalLookDelta,
    cameraMode === "first" ? -1.05 : -0.3,
    cameraMode === "first" ? 1.05 : 0.68,
  );
}

function onTouchLookEnd(event) {
  if (event.pointerId === lookPointerId) lookPointerId = null;
}

function bindHoldAction(button, setPressed) {
  let activePointerId = null;
  const release = (event) => {
    if (event.pointerId !== activePointerId) return;
    activePointerId = null;
    setPressed(false);
    button.classList.remove("is-active");
  };

  button.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    activePointerId = event.pointerId;
    capturePointer(button, event.pointerId);
    setPressed(true);
    button.classList.add("is-active");
  });
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
}

function setMobileSettingsOpen(open) {
  mobileSettings.hidden = !open;
  mobileSettingsButton.setAttribute("aria-expanded", String(open));
}

function isMobileFullscreen() {
  return Boolean(
    document.fullscreenElement || document.webkitFullscreenElement,
  );
}

function getFullscreenRequester() {
  return (
    document.documentElement.requestFullscreen ||
    document.documentElement.webkitRequestFullscreen
  );
}

function syncFullscreenControls() {
  const fullscreen = isMobileFullscreen();
  const label = fullscreen ? "Thoát toàn màn hình" : "Toàn màn hình ngang";

  mobileFullscreenButton.textContent = label;
  mobileFullscreenButton.disabled = false;
  mobileQuickFullscreenButton.hidden = false;
  mobileQuickFullscreenButton.setAttribute("aria-pressed", String(fullscreen));
  mobileQuickFullscreenButton.setAttribute("aria-label", label);
  mobileQuickFullscreenButton.querySelector("small").textContent = fullscreen
    ? "Thoát"
    : "Full";
  document.body.classList.toggle("mobile-immersive", fullscreen);
}

async function enterMobileFullscreen() {
  if (isMobileFullscreen()) return true;

  const requestFullscreen = getFullscreenRequester();
  if (!requestFullscreen) {
    showToast("Đã dùng toàn bộ viewport Safari ở chế độ ngang");
    resize();
    syncFullscreenControls();
    return false;
  }

  try {
    await requestFullscreen.call(document.documentElement, {
      navigationUI: "hide",
    });
    if (screen.orientation?.lock) {
      try {
        await screen.orientation.lock("landscape");
      } catch {
        // Safari có thể cho fullscreen nhưng không cho khóa hướng màn hình.
      }
    }
    syncFullscreenControls();
    return true;
  } catch (error) {
    showToast("Safari đang dùng viewport ngang khả dụng");
    console.info("Safari không cho phép Fullscreen API", error);
    resize();
    syncFullscreenControls();
    return false;
  }
}

async function toggleMobileFullscreen() {
  if (!isMobileFullscreen()) {
    await enterMobileFullscreen();
    return;
  }

  try {
    const exitFullscreen =
      document.exitFullscreen || document.webkitExitFullscreen;
    await exitFullscreen?.call(document);
  } finally {
    syncFullscreenControls();
  }
}

window.addEventListener("keydown", onKeyDown);
pauseMenu.addEventListener("cancel", (event) => {
  event.preventDefault();
  closePauseMenu();
});
resumeButton.addEventListener("click", () => closePauseMenu(true));
document.addEventListener("pointerlockchange", () => {
  const isLocked = document.pointerLockElement === canvas;
  if (wasPointerLocked && !isLocked && gameState === "playing" && !pauseMenu.open) {
    openPauseMenu();
  }
  wasPointerLocked = isLocked;
});
window.addEventListener("keyup", (event) => pressedKeys.delete(event.code));
window.addEventListener("blur", () => {
  pressedKeys.clear();
  resetTouchInput();
});
window.addEventListener("mousemove", onMouseMove);
window.addEventListener("mouseup", () => { mouseDragging = false; });
canvas.addEventListener("mousedown", (event) => { if (event.button === 0) mouseDragging = true; });
canvas.addEventListener("wheel", onMouseWheel, { passive: false });
canvas.addEventListener("pointerdown", onTouchLookStart, { passive: false });
canvas.addEventListener("pointermove", onTouchLookMove, { passive: false });
canvas.addEventListener("pointerup", onTouchLookEnd);
canvas.addEventListener("pointercancel", onTouchLookEnd);
canvas.addEventListener("click", () => {
  if (
    !usesTouchControls() &&
    gameState === "playing" &&
    document.pointerLockElement !== canvas
  ) {
    requestGamePointerLock();
  }
});
mobileJoystick.addEventListener("pointerdown", onJoystickPointerDown, {
  passive: false,
});
mobileJoystick.addEventListener("pointermove", onJoystickPointerMove, {
  passive: false,
});
mobileJoystick.addEventListener("pointerup", onJoystickPointerUp);
mobileJoystick.addEventListener("pointercancel", onJoystickPointerUp);
bindHoldAction(mobileSprintAction, (pressed) => {
  touchSprintPressed = pressed;
});
bindHoldAction(mobileJumpAction, (pressed) => {
  touchJumpPressed = pressed;
});
mobileCameraAction.addEventListener("click", () => {
  if (gameState === "playing") toggleCameraMode();
});
mobileSettingsButton.addEventListener("click", () => {
  setMobileSettingsOpen(mobileSettings.hidden);
});
mobileSettingsClose.addEventListener("click", () => {
  setMobileSettingsOpen(false);
});
mobileCameraSetting.addEventListener("click", () => {
  if (gameState === "playing") toggleCameraMode();
});
touchSensitivityInput.addEventListener("input", () => {
  touchLookSensitivity = Number(touchSensitivityInput.value);
});
soundVolumeInput.addEventListener("input", () => {
  soundVolume = Number(soundVolumeInput.value);
  saveSoundSetting("deepwood-sound-volume", String(soundVolume));
  updateSoundControls();
  if (soundVolume <= 0) {
    forestAmbience.pause();
  } else if (
    !soundMuted &&
    forestAmbience.paused &&
    (gameState === "playing" || gameState === "transforming")
  ) {
    startForestAmbience();
  }
});
mobileSoundToggle.addEventListener("click", () => {
  setSoundMuted(!soundMuted);
});
soundToggle.addEventListener("click", () => {
  setSoundMuted(!soundMuted);
});
weatherCycleButton.addEventListener("click", cycleWeather);
weatherSelect.addEventListener("change", () => {
  setWeather(weatherSelect.value);
});
mobileFullscreenButton.addEventListener("click", () => {
  setMobileSettingsOpen(false);
  void toggleMobileFullscreen();
});
mobileQuickFullscreenButton.addEventListener("click", () => {
  void toggleMobileFullscreen();
});
mapZoomInButton.addEventListener("click", () => {
  setMinimapZoom(minimapWorldSpan - 18);
});
mapZoomOutButton.addEventListener("click", () => {
  setMinimapZoom(minimapWorldSpan + 18);
});
touchLayoutQuery.addEventListener("change", () => {
  resetTouchInput();
  resizeMinimap();
  updateMinimap(0, true);
});
startButton.addEventListener("click", () => {
  startGame();
});
restartButton.addEventListener("click", startGame);
roundLoadingRetry.addEventListener("click", () => {
  if (gameState === "loading-round-two") void waitForRoundTwo();
});

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  resizeMinimap();
}

function handleViewportChange() {
  resize();
}

window.addEventListener("resize", handleViewportChange);
window.visualViewport?.addEventListener("resize", handleViewportChange);
document.addEventListener("fullscreenchange", handleViewportChange);
document.addEventListener("fullscreenchange", syncFullscreenControls);
document.addEventListener("webkitfullscreenchange", handleViewportChange);
document.addEventListener("webkitfullscreenchange", syncFullscreenControls);
screen.orientation?.addEventListener("change", () => {
  resetTouchInput();
  resize();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    forestAmbience.pause();
  } else if (gameState === "playing" || gameState === "transforming") {
    startForestAmbience();
  }
});
syncFullscreenControls();
resize();
setMinimapZoom(90);
updateMobileCameraLabels();
resetGame();
camera.position.set(
  SPAWN_X + 4,
  gameplayGroundHeight(SPAWN_X, SPAWN_Z) + 3.2,
  SPAWN_Z + 6,
);

const clock = new THREE.Clock();
function gameLoop() {
  const deltaTime = Math.min(clock.getDelta(), 0.1);
  if (pauseMenu.open || gameState === "loading-round-two") {
    updateAtmosphere();
    renderer.render(scene, camera);
    requestAnimationFrame(gameLoop);
    return;
  }
  elapsedTime += deltaTime;

  if (gameState === "playing") {
    timeRemaining = Math.max(0, timeRemaining - deltaTime);
    if (timeRemaining <= 20) timerElement.parentElement.classList.add("is-urgent");
    updatePlayer(deltaTime);
    if (timeRemaining <= 0) finishGame(false, "time");
  }
  if (gameState === "transforming") updateVictoryTransformation(deltaTime);

  updateCores(deltaTime);
  updateHunters(deltaTime);
  updateBeacon(deltaTime);
  updateCamera(deltaTime);
  grass.userData.update?.(deltaTime, elapsedTime, playerRoot.position);
  flowerGarden.userData.update?.(deltaTime, elapsedTime, playerRoot.position);
  butterflies.userData.update?.(deltaTime, elapsedTime, playerRoot.position);
  fireflies.userData.update?.(deltaTime, elapsedTime, playerRoot.position);
  weatherEffects.userData.update(
    deltaTime,
    elapsedTime,
    playerRoot.position,
    currentWeather,
  );
  updateSpatialCulling(deltaTime);
  updateAtmosphere();
  updateHud();
  updateMinimap(deltaTime);
  if (currentRound === 2) {
    player.transformedMixer?.update(deltaTime);
  } else {
    player.mixer?.update(deltaTime);
  }

  sun.position.set(playerRoot.position.x - 18, playerRoot.position.y + 30, playerRoot.position.z + 14);
  sun.target.position.copy(playerRoot.position);
  renderer.render(scene, camera);
  requestAnimationFrame(gameLoop);
}

rendererReady.then(gameLoop);
