import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const WORLD_SIZE = 80;
export const HALF_WORLD = WORLD_SIZE * 0.5;

export default {
  title: "Forest environment",
  description:
    "Terrain 80m · đường mòn · núi · đá · cây và cỏ instanced. WASD di chuyển · Shift chạy · Space nhảy.",
  usesKeyboard: true,

  setup({ scene, camera, renderer, pressedKeys }) {
    // ---------------------------------------------------------------------
    // 1. LƯU CẤU HÌNH CŨ
    // Lesson 10 thay đổi fog, shadow và tone mapping. Các giá trị này được lưu
    // lại để khi chuyển sang lesson khác, renderer trở về đúng trạng thái cũ.
    // ---------------------------------------------------------------------
    const previousFog = scene.fog;
    const previousFar = camera.far;
    const previousShadowEnabled = renderer.shadowMap.enabled;
    const previousShadowType = renderer.shadowMap.type;
    const previousToneMapping = renderer.toneMapping;
    const previousToneMappingExposure = renderer.toneMappingExposure;

    // ---------------------------------------------------------------------
    // 2. CẤU HÌNH KHÔNG KHÍ VÀ RENDERER
    // Fog tạo chiều sâu, shadow tạo bóng cây và ACES giúp ánh sáng tự nhiên hơn.
    // ---------------------------------------------------------------------
    scene.background = new THREE.Color("#9bc5d0");
    scene.fog = new THREE.FogExp2("#9bb8b3", 0.018);
    camera.far = 150;
    camera.updateProjectionMatrix();
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    // ---------------------------------------------------------------------
    // 3. ÁNH SÁNG
    // HemisphereLight chiếu sáng toàn cảnh. DirectionalLight đóng vai mặt trời.
    // ---------------------------------------------------------------------
    const hemisphere = new THREE.HemisphereLight("#dff6ff", "#263c2b", 2.4);
    const sun = new THREE.DirectionalLight("#fff3cf", 3.8);
    sun.position.set(-18, 30, 14);
    sun.castShadow = true;
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
      new THREE.SphereGeometry(2.1, 20, 12),
      new THREE.MeshBasicMaterial({ color: "#fff1b8", fog: false }),
    );
    sunDisc.position.set(-34, 34, -58);
    scene.add(sunDisc);

    // ---------------------------------------------------------------------
    // 4. ĐỊA HÌNH VÀ ĐƯỜNG MÒN
    // Terrain là PlaneGeometry biến dạng bằng terrainHeight(). Trail là một
    // dải BufferGeometry riêng nằm cao hơn terrain một chút để tránh z-fighting.
    // ---------------------------------------------------------------------
    const terrain = createTerrain();
    terrain.receiveShadow = true;
    scene.add(terrain);

    const trail = createTrail();
    trail.receiveShadow = true;
    scene.add(trail);

    // ---------------------------------------------------------------------
    // 5. RẢI CÂY, ĐÁ, CỎ VÀ NÚI
    // Random có seed giúp vị trí vật thể luôn giống nhau sau mỗi lần reload.
    // Cây, đá và cỏ dùng InstancedMesh để hàng nghìn vật thể chỉ tốn ít draw call.
    // ---------------------------------------------------------------------
    const random = mulberry32(104729);
    const treeColliders = [];
    const rockColliders = [];
    const treeGroup = createTrees(random, treeColliders);
    const rockField = createRocks(random, rockColliders);
    const grassField = createGrass(random);
    const mountains = createMountains();
    const worldColliders = [...treeColliders, ...rockColliders];
    scene.add(mountains, treeGroup, rockField, grassField);

    // ---------------------------------------------------------------------
    // 6. PLAYER ROOT VÀ VÒNG ĐÁNH DẤU
    // playerRoot chứa cả robot và marker. Di chuyển root sẽ đưa toàn bộ player đi.
    // ---------------------------------------------------------------------
    const playerRoot = new THREE.Group();
    playerRoot.position.set(pathCenterX(12), terrainHeight(pathCenterX(12), 12), 12);
    scene.add(playerRoot);

    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.74, 40),
      new THREE.MeshBasicMaterial({
        color: "#8be9fd",
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.035;
    playerRoot.add(marker);

    // ---------------------------------------------------------------------
    // 7. HUD THỐNG KÊ VÀ HƯỚNG DẪN ĐIỀU KHIỂN
    // ---------------------------------------------------------------------
    const hud = document.createElement("section");
    hud.className = "character-hud environment-hud";
    hud.innerHTML = `
      <div class="character-hud__heading">
        <strong>Forest Environment</strong>
        <span data-field="load">Đang tải robot…</span>
      </div>
      <dl>
        <dt>Terrain</dt><dd>80 × 80 m</dd>
        <dt>Cây</dt><dd>140 instances</dd>
        <dt>Đá</dt><dd>64 instances</dd>
        <dt>Cỏ</dt><dd>1.600 instances</dd>
        <dt>Animation</dt><dd data-field="state">—</dd>
      </dl>
      <div class="control-keys" aria-label="Điều khiển trong rừng">
        <span><kbd>WASD</kbd> di chuyển</span>
        <span><kbd>Shift</kbd> chạy</span>
        <span><kbd>Space</kbd> nhảy</span>
      </div>
    `;
    document.querySelector(".stage").append(hud);

    const loadField = hud.querySelector("[data-field='load']");
    const stateField = hud.querySelector("[data-field='state']");
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
    };
    const loader = new GLTFLoader();
    let disposed = false;
    let jumpWasPressed = false;

    // Chuyển AnimationAction bằng crossfade để idle/walk/run/jump không bị giật.
    function playAnimation(name) {
      if (!player.mixer || player.activeState === name) return;
      const nextAction = player.actions.get(name);
      if (!nextAction) return;

      nextAction.reset();
      nextAction.enabled = true;
      nextAction.setEffectiveWeight(1);
      nextAction.setEffectiveTimeScale(
        name === "run" ? 1.1 : name === "jump" ? 1.08 : 1,
      );
      nextAction.setLoop(
        name === "jump" ? THREE.LoopOnce : THREE.LoopRepeat,
        name === "jump" ? 1 : Infinity,
      );
      nextAction.clampWhenFinished = name === "jump";
      nextAction.fadeIn(0.18).play();
      player.activeAction?.fadeOut(0.18);
      player.activeAction = nextAction;
      player.activeState = name;
      stateField.textContent = name;
    }

    // ---------------------------------------------------------------------
    // 8. TẢI ROBOT GLB
    // Chuẩn hóa chiều cao robot thành 2.15m, đặt chân xuống y=0, bật shadow
    // rồi tạo AnimationMixer từ các clip nằm trong file GLB.
    // ---------------------------------------------------------------------
    loader.load(
      "/models/futuristic-robot-v2-animated.glb",
      (gltf) => {
        if (disposed) {
          disposeObject(gltf.scene);
          return;
        }

        player.model = gltf.scene;
        player.model.updateMatrixWorld(true);
        const sourceBounds = new THREE.Box3().setFromObject(player.model);
        const sourceHeight = sourceBounds.getSize(new THREE.Vector3()).y;
        player.model.scale.setScalar(sourceHeight > 0 ? 2.15 / sourceHeight : 1);
        player.model.updateMatrixWorld(true);

        const fittedBounds = new THREE.Box3().setFromObject(player.model);
        const fittedCenter = fittedBounds.getCenter(new THREE.Vector3());
        player.model.position.set(
          -fittedCenter.x,
          -fittedBounds.min.y,
          -fittedCenter.z,
        );
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
        loadField.textContent = "Sẵn sàng khám phá";
        playAnimation("idle");
      },
      undefined,
      (error) => {
        console.error("Không tải được robot cho Lesson 10", error);
        loadField.textContent = "Lỗi tải robot";
        loadField.classList.add("is-error");
      },
    );

    // Các vector tạm được tái sử dụng mỗi frame để hạn chế tạo garbage.
    const direction = new THREE.Vector3();
    const displacement = new THREE.Vector3();
    const cameraTarget = new THREE.Vector3();
    const desiredCamera = new THREE.Vector3();
    const targetFacing = new THREE.Quaternion();

    camera.position.set(
      playerRoot.position.x + 7.5,
      playerRoot.position.y + 6.2,
      playerRoot.position.z + 10.5,
    );

    // ---------------------------------------------------------------------
    // 9. COLLISION ĐƠN GIẢN
    // Player được xem như một hình tròn trên mặt phẳng XZ. Nếu chạm collider
    // cây/đá, player được đẩy ra theo hướng ngắn nhất.
    // ---------------------------------------------------------------------
    function resolveWorldCollisions() {
      const playerRadius = 0.48;
      for (const collider of worldColliders) {
        const dx = playerRoot.position.x - collider.x;
        const dz = playerRoot.position.z - collider.z;
        const minimumDistance = playerRadius + collider.radius;
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

    // ---------------------------------------------------------------------
    // 10. CAMERA AVOIDANCE
    // Kiểm tra đường thẳng từ player tới camera. Nếu tán cây nằm giữa hai điểm,
    // camera tự tiến gần player để không bị cây che toàn bộ khung hình.
    // ---------------------------------------------------------------------
    function preventCameraOcclusion(target, desired) {
      const rayX = desired.x - target.x;
      const rayZ = desired.z - target.z;
      const rayLengthSquared = rayX * rayX + rayZ * rayZ;
      const rayLength = Math.sqrt(rayLengthSquared);
      let allowedAmount = 1;

      for (const tree of treeColliders) {
        const toTreeX = tree.x - target.x;
        const toTreeZ = tree.z - target.z;
        const amount = THREE.MathUtils.clamp(
          (toTreeX * rayX + toTreeZ * rayZ) / rayLengthSquared,
          0,
          1,
        );
        if (amount < 0.18 || amount >= allowedAmount) continue;

        const closestX = target.x + rayX * amount;
        const closestZ = target.z + rayZ * amount;
        const distance = Math.hypot(tree.x - closestX, tree.z - closestZ);
        if (distance >= tree.cameraRadius) continue;

        allowedAmount = Math.min(
          allowedAmount,
          Math.max(0.22, amount - (tree.cameraRadius + 0.45) / rayLength),
        );
      }

      if (allowedAmount < 1) {
        desired.lerpVectors(target, desired, allowedAmount);
        desired.y += 0.45;
      }
    }

    // ---------------------------------------------------------------------
    // 11. GAME LOOP CỦA LESSON 10
    // Thứ tự mỗi frame:
    // đọc input → tính vận tốc → di chuyển → collision → xoay player → jump
    // → bám terrain → animation → camera → cập nhật vị trí shadow của mặt trời.
    // ---------------------------------------------------------------------
    function update(deltaTime) {
      // Đọc WASD hoặc phím mũi tên thành vector hướng trên mặt phẳng XZ.
      direction.set(0, 0, 0);
      if (pressedKeys.has("KeyW") || pressedKeys.has("ArrowUp")) direction.z -= 1;
      if (pressedKeys.has("KeyS") || pressedKeys.has("ArrowDown")) direction.z += 1;
      if (pressedKeys.has("KeyA") || pressedKeys.has("ArrowLeft")) direction.x -= 1;
      if (pressedKeys.has("KeyD") || pressedKeys.has("ArrowRight")) direction.x += 1;

      const moving = direction.lengthSq() > 0;
      const running =
        pressedKeys.has("ShiftLeft") || pressedKeys.has("ShiftRight");
      if (moving) direction.normalize();

      // Tăng/giảm tốc mượt bằng lerp thay vì đổi vận tốc ngay lập tức.
      const targetSpeed = moving ? (running ? 5.3 : 3.05) : 0;
      player.targetVelocity.copy(direction).multiplyScalar(targetSpeed);
      player.velocity.lerp(
        player.targetVelocity,
        1 - Math.exp(-(moving ? 8 : 11) * deltaTime),
      );
      if (!moving && player.velocity.lengthSq() < 0.0004) {
        player.velocity.set(0, 0, 0);
      }

      // Di chuyển ngang, giới hạn player trong map rồi xử lý va chạm cây/đá.
      displacement.copy(player.velocity).multiplyScalar(deltaTime);
      playerRoot.position.add(displacement);
      playerRoot.position.x = THREE.MathUtils.clamp(
        playerRoot.position.x,
        -HALF_WORLD + 1.2,
        HALF_WORLD - 1.2,
      );
      playerRoot.position.z = THREE.MathUtils.clamp(
        playerRoot.position.z,
        -HALF_WORLD + 1.2,
        HALF_WORLD - 1.2,
      );
      resolveWorldCollisions();

      // Xoay robot từ từ về đúng hướng đang di chuyển.
      if (moving) {
        targetFacing.setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          Math.atan2(direction.x, direction.z),
        );
        playerRoot.quaternion.slerp(
          targetFacing,
          1 - Math.exp(-12 * deltaTime),
        );
      }

      // Space chỉ tạo một lần bật nhảy cho mỗi lần nhấn, tránh giữ phím để bay.
      const jumpPressed = pressedKeys.has("Space");
      if (jumpPressed && !jumpWasPressed && player.grounded) {
        player.verticalVelocity = 5.6;
        player.grounded = false;
      }
      jumpWasPressed = jumpPressed;

      // Gravity kéo robot xuống; jumpHeight không bao giờ nhỏ hơn mặt đất.
      if (!player.grounded) {
        player.verticalVelocity -= 15.5 * deltaTime;
        player.jumpHeight += player.verticalVelocity * deltaTime;
        if (player.jumpHeight <= 0) {
          player.jumpHeight = 0;
          player.verticalVelocity = 0;
          player.grounded = true;
        }
      }

      // Lấy độ cao terrain tại chân player rồi cộng thêm độ cao đang nhảy.
      const groundHeight = terrainHeight(
        playerRoot.position.x,
        playerRoot.position.z,
      );
      playerRoot.position.y = groundHeight + player.jumpHeight;

      // State machine chọn clip phù hợp với trạng thái gameplay hiện tại.
      playAnimation(
        !player.grounded
          ? "jump"
          : player.velocity.length() > 0.12
            ? running
              ? "run"
              : "walk"
            : "idle",
      );
      player.mixer?.update(deltaTime);

      // Camera follow có smoothing; sau đó camera avoidance xử lý cây che khuất.
      cameraTarget.set(
        playerRoot.position.x,
        playerRoot.position.y + 1.15,
        playerRoot.position.z,
      );
      desiredCamera.set(
        playerRoot.position.x + 7.5,
        playerRoot.position.y + 6.2,
        playerRoot.position.z + 10.5,
      );
      preventCameraOcclusion(cameraTarget, desiredCamera);
      camera.position.lerp(desiredCamera, 1 - Math.exp(-4.2 * deltaTime));
      camera.lookAt(cameraTarget);

      // Shadow camera đi theo player để giữ độ nét bóng ở khu vực đang chơi.
      sun.position.set(
        playerRoot.position.x - 18,
        playerRoot.position.y + 30,
        playerRoot.position.z + 14,
      );
      sun.target.position.copy(playerRoot.position);
    }

    return {
      update,
      dispose() {
        // Dọn mixer/HUD và khôi phục cấu hình renderer khi rời Lesson 10.
        disposed = true;
        player.mixer?.stopAllAction();
        if (player.mixer && player.model) {
          player.mixer.uncacheRoot(player.model);
        }
        hud.remove();
        scene.fog = previousFog;
        camera.far = previousFar;
        camera.updateProjectionMatrix();
        renderer.shadowMap.enabled = previousShadowEnabled;
        renderer.shadowMap.type = previousShadowType;
        renderer.toneMapping = previousToneMapping;
        renderer.toneMappingExposure = previousToneMappingExposure;
      },
    };
  },
};

// -------------------------------------------------------------------------
// TERRAIN HEIGHT FUNCTION
// Trộn nhiều sóng sin/cos để tạo đồi lớn/nhỏ. Vùng gần đường mòn được làm phẳng
// bằng trailFlattening để robot không phải đi trên một con đường quá gồ ghề.
// -------------------------------------------------------------------------
function naturalTerrainHeight(x, z) {
  return (
    Math.sin(x * 0.115) * 0.72 +
    Math.cos(z * 0.095) * 0.58 +
    Math.sin((x + z) * 0.055) * 0.9 +
    Math.cos((x - z) * 0.042) * 0.55
  );
}

export function terrainHeight(x, z) {
  const broadHills = naturalTerrainHeight(x, z);
  const localPathHeight = naturalTerrainHeight(pathCenterX(z), z) - 0.025;
  const trailDistance = Math.abs(x - pathCenterX(z));
  const trailFlattening = Math.exp(-(trailDistance * trailDistance) / 7.5);
  // Làm phẳng theo cao độ tự nhiên ngay tại tim đường. Cách cũ kéo đường về
  // gần y=0 nên nó biến thành một rãnh sâu khi đi qua sườn đồi.
  return THREE.MathUtils.lerp(
    broadHills,
    localPathHeight,
    trailFlattening * 0.82,
  );
}

// Tâm đường mòn thay đổi theo Z để tạo một con đường uốn cong qua khu rừng.
export function pathCenterX(z) {
  return Math.sin(z * 0.105) * 2.6 + Math.sin(z * 0.035) * 1.4;
}

// Tạo PlaneGeometry 80x80m, thay đổi Y của từng vertex và gán vertex color.
export function createTerrain({ worldSize = WORLD_SIZE, segments = 96 } = {}) {
  const geometry = new THREE.PlaneGeometry(
    worldSize,
    worldSize,
    segments,
    segments,
  );
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = [];
  const low = new THREE.Color("#365c35");
  const high = new THREE.Color("#68805a");
  const color = new THREE.Color();

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const height = terrainHeight(x, z);
    positions.setY(index, height);
    const shade = THREE.MathUtils.clamp((height + 2.5) / 5, 0, 1);
    color.copy(low).lerp(high, shade);
    const variation = Math.sin(x * 2.13 + z * 1.71) * 0.025;
    color.offsetHSL(variation, 0, variation * 0.4);
    colors.push(color.r, color.g, color.b);
  }

  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
      metalness: 0,
    }),
  );
}

function createDirtTrailTexture() {
  const width = 128;
  const height = 256;
  const data = new Uint8Array(width * height * 4);
  const random = mulberry32(789221);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const lateral = Math.abs(u * 2 - 1);
      const rutLeft = Math.exp(-((u - 0.32) ** 2) / 0.0032);
      const rutRight = Math.exp(-((u - 0.68) ** 2) / 0.0032);
      const ruts = Math.min(1, rutLeft + rutRight);
      const edge = THREE.MathUtils.smoothstep(lateral, 0.72, 1);
      const grain = (random() - 0.5) * 19;
      const patch =
        Math.sin(y * 0.17 + x * 0.11) * 5 +
        Math.sin(y * 0.043 - x * 0.23) * 4;
      const pebble = random() > 0.986 ? 22 : 0;
      const index = (y * width + x) * 4;

      data[index] = THREE.MathUtils.clamp(
        132 + grain + patch + pebble - ruts * 24 - edge * 35,
        0,
        255,
      );
      data[index + 1] = THREE.MathUtils.clamp(
        94 + grain * 0.58 + patch * 0.45 + pebble * 0.65 - ruts * 18 - edge * 13,
        0,
        255,
      );
      data[index + 2] = THREE.MathUtils.clamp(
        58 + grain * 0.34 + patch * 0.25 + pebble * 0.35 - ruts * 10 - edge * 15,
        0,
        255,
      );
      data[index + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(
    data,
    width,
    height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

// Tạo dải tam giác bám theo pathCenterX() với rìa không đều, vệt bánh và
// hạt đất procedural để đường đọc giống đất nén thay vì một dải màu phẳng.
export function createTrail({ worldSize = WORLD_SIZE, segments = 100 } = {}) {
  const halfWorld = worldSize * 0.5;
  const baseWidth = 2.7;
  const acrossSegments = 6;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let index = 0; index <= segments; index += 1) {
    const amount = index / segments;
    const z = -halfWorld + 1 + amount * (worldSize - 2);
    const centerX = pathCenterX(z);
    const nextX = pathCenterX(z + 0.1);
    const tangentX = (nextX - centerX) / 0.1;
    const normalX = 1 / Math.sqrt(1 + tangentX * tangentX);
    const normalZ = -tangentX * normalX;

    const widthVariation =
      1 + Math.sin(z * 0.71) * 0.055 + Math.sin(z * 1.93 + 0.8) * 0.025;
    const centerWander = Math.sin(z * 1.37) * 0.045;
    for (let sideIndex = 0; sideIndex <= acrossSegments; sideIndex += 1) {
      const lateral = (sideIndex / acrossSegments) * 2 - 1;
      const offset = centerWander + lateral * baseWidth * 0.5 * widthVariation;
      const x = centerX + normalX * offset;
      const sideZ = z + normalZ * offset;
      const rut =
        Math.exp(-((lateral - 0.36) ** 2) / 0.018) +
        Math.exp(-((lateral + 0.36) ** 2) / 0.018);
      const crown = (1 - lateral * lateral) * 0.014 - rut * 0.007;
      positions.push(x, terrainHeight(x, sideZ) + 0.032 + crown, sideZ);
      uvs.push(sideIndex / acrossSegments, amount * 22);
    }

    if (index < segments) {
      const rowStart = index * (acrossSegments + 1);
      const nextRowStart = rowStart + acrossSegments + 1;
      for (let sideIndex = 0; sideIndex < acrossSegments; sideIndex += 1) {
        const a = rowStart + sideIndex;
        const b = a + 1;
        const c = nextRowStart + sideIndex;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      map: createDirtTrailTexture(),
      color: "#d8c09a",
      roughness: 1,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
}

// Tách một InstancedMesh lớn thành các ô không gian nhỏ. Mỗi ô có bounding
// sphere riêng nên Three.js có thể frustum-cull từng khu vực thay vì phải vẽ
// cả khu rừng chỉ vì một cây còn nằm trong camera.
function createSpatialChunks(source, placements, chunkSize, namePrefix) {
  if (!chunkSize || chunkSize <= 0) return [source];

  const buckets = new Map();
  placements.forEach((placement, index) => {
    const cellX = Math.floor(placement.x / chunkSize);
    const cellZ = Math.floor(placement.z / chunkSize);
    const key = `${cellX}:${cellZ}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(index);
  });

  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  return [...buckets.values()].map((indices, chunkIndex) => {
    const chunk = new THREE.InstancedMesh(
      source.geometry,
      source.material,
      indices.length,
    );
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    indices.forEach((sourceIndex, instanceIndex) => {
      const placement = placements[sourceIndex];
      source.getMatrixAt(sourceIndex, matrix);
      chunk.setMatrixAt(instanceIndex, matrix);
      if (source.instanceColor) {
        source.getColorAt(sourceIndex, color);
        chunk.setColorAt(instanceIndex, color);
      }
      minX = Math.min(minX, placement.x);
      maxX = Math.max(maxX, placement.x);
      minZ = Math.min(minZ, placement.z);
      maxZ = Math.max(maxZ, placement.z);
    });

    chunk.name = `${namePrefix}-chunk-${chunkIndex}`;
    chunk.instanceMatrix.needsUpdate = true;
    if (chunk.instanceColor) chunk.instanceColor.needsUpdate = true;
    chunk.castShadow = source.castShadow;
    chunk.receiveShadow = source.receiveShadow;
    chunk.frustumCulled = true;
    chunk.computeBoundingSphere();
    chunk.userData.spatialChunk = {
      centerX: (minX + maxX) * 0.5,
      centerZ: (minZ + maxZ) * 0.5,
      radius: Math.hypot(maxX - minX, maxZ - minZ) * 0.5,
    };
    return chunk;
  });
}

// Tạo 140 cây bằng InstancedMesh. Mặc định dùng cây procedural; lesson có thể
// truyền modelUrl để thay bằng GLB nhưng vẫn giữ chung geometry/material.
export function createTrees(
  random,
  colliders,
  {
    modelUrl = null,
    modelLoader = null,
    chunkSize = 0,
    castShadow = true,
    receiveShadow = true,
    worldHalfExtent = HALF_WORLD,
  } = {},
) {
  const count = 140;
  const targetHeight = 6.05;
  const group = new THREE.Group();
  const trunkGeometry = new THREE.CylinderGeometry(0.26, 0.38, 2.8, 7);
  const lowerGeometry = new THREE.ConeGeometry(1.42, 3.4, 8);
  const upperGeometry = new THREE.ConeGeometry(1.05, 2.8, 8);
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: "#654a34",
    roughness: 1,
  });
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: "#315c38",
    roughness: 0.92,
  });
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, count);
  const lowerLeaves = new THREE.InstancedMesh(lowerGeometry, leafMaterial, count);
  const upperLeaves = new THREE.InstancedMesh(upperGeometry, leafMaterial, count);
  const dummy = new THREE.Object3D();
  const leafColor = new THREE.Color();
  const placements = [];

  let created = 0;
  while (created < count) {
    const x = (random() * 2 - 1) * (worldHalfExtent - 3);
    const z = (random() * 2 - 1) * (worldHalfExtent - 3);
    if (Math.abs(x - pathCenterX(z)) < 3.5) continue;
    // Chừa một clearing quanh điểm xuất phát để người chơi nhìn được bố cục
    // trước khi đi sâu vào vùng cây dày.
    if (Math.hypot(x - pathCenterX(12), z - 12) < 14.5) continue;

    const scale = 0.72 + random() * 0.68;
    const rotation = random() * Math.PI * 2;
    const y = terrainHeight(x, z);
    placements.push({ x, y, z, scale, rotation });

    dummy.position.set(x, y + 1.4 * scale, z);
    dummy.rotation.set(0, rotation, 0);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(created, dummy.matrix);

    dummy.position.y = y + 3.25 * scale;
    dummy.rotation.y = rotation + random() * 0.3;
    dummy.updateMatrix();
    lowerLeaves.setMatrixAt(created, dummy.matrix);

    dummy.position.y = y + 4.65 * scale;
    dummy.rotation.y += 0.35;
    dummy.updateMatrix();
    upperLeaves.setMatrixAt(created, dummy.matrix);

    leafColor.setHSL(0.29 + random() * 0.035, 0.34, 0.26 + random() * 0.08);
    lowerLeaves.setColorAt(created, leafColor);
    upperLeaves.setColorAt(created, leafColor.clone().offsetHSL(0.01, 0, 0.035));
    colliders.push({
      x,
      z,
      radius: 0.34 * scale,
      cameraRadius: 2.1 * scale,
    });
    created += 1;
  }

  for (const mesh of [trunks, lowerLeaves, upperLeaves]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
  }
  lowerLeaves.instanceColor.needsUpdate = true;
  upperLeaves.instanceColor.needsUpdate = true;
  const fallbackMeshes = [
    ...createSpatialChunks(trunks, placements, chunkSize, "tree-trunks"),
    ...createSpatialChunks(lowerLeaves, placements, chunkSize, "tree-lower-leaves"),
    ...createSpatialChunks(upperLeaves, placements, chunkSize, "tree-upper-leaves"),
  ];
  group.add(...fallbackMeshes);

  // Giữ cây procedural làm fallback trong lúc GLB tải. Khi model sẵn sàng,
  // geometry/material của nó được dùng chung cho 140 instance, thay vì clone
  // 140 scene GLTF riêng lẻ. Collider vẫn dùng placement đã tạo ở trên.
  if (modelUrl) {
    const loader = modelLoader ?? new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        // Nếu người dùng đã rời lesson trong lúc tải, giải phóng model ngay.
        if (!group.parent) {
          disposeObject(gltf.scene);
          return;
        }

        gltf.scene.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(gltf.scene);
        const sourceHeight = bounds.getSize(new THREE.Vector3()).y;
        const sourceMeshes = [];
        gltf.scene.traverse((object) => {
          if (object.isMesh && object.geometry) sourceMeshes.push(object);
        });

        if (!sourceMeshes.length || sourceHeight <= 0) {
          console.warn(`Model cây không hợp lệ: ${modelUrl}`);
          disposeObject(gltf.scene);
          return;
        }

        const center = bounds.getCenter(new THREE.Vector3());
        const fittedScale = targetHeight / sourceHeight;
        const importedMeshes = [];

        for (const sourceMesh of sourceMeshes) {
          // Bake transform của node vào geometry, đặt tâm cây tại XZ = 0 và
          // chân cây tại Y = 0 để mọi instance bám đúng terrain.
          const geometry = sourceMesh.geometry.clone();
          geometry.applyMatrix4(sourceMesh.matrixWorld);
          geometry.translate(-center.x, -bounds.min.y, -center.z);
          geometry.scale(fittedScale, fittedScale, fittedScale);

          const sourceMaterials = Array.isArray(sourceMesh.material)
            ? sourceMesh.material
            : [sourceMesh.material];
          const materials = sourceMaterials.map((material) => material.clone());
          const material = Array.isArray(sourceMesh.material)
            ? materials
            : materials[0];
          const instances = new THREE.InstancedMesh(geometry, material, count);
          instances.name = `evergreen-${sourceMesh.name || importedMeshes.length}`;

          placements.forEach((placement, index) => {
            dummy.position.set(placement.x, placement.y, placement.z);
            dummy.rotation.set(0, placement.rotation, 0);
            dummy.scale.setScalar(placement.scale);
            dummy.updateMatrix();
            instances.setMatrixAt(index, dummy.matrix);
          });

          instances.instanceMatrix.needsUpdate = true;
          instances.castShadow = castShadow;
          instances.receiveShadow = receiveShadow;
          importedMeshes.push(
            ...createSpatialChunks(
              instances,
              placements,
              chunkSize,
              `evergreen-${sourceMesh.name || importedMeshes.length}`,
            ),
          );
        }

        group.remove(...fallbackMeshes);
        trunkGeometry.dispose();
        lowerGeometry.dispose();
        upperGeometry.dispose();
        trunkMaterial.dispose();
        leafMaterial.dispose();
        group.add(...importedMeshes);
        disposeObject(gltf.scene);
      },
      undefined,
      (error) => {
        // Model procedural vẫn hiển thị nếu GLB không tải được.
        console.error(`Không tải được model cây ${modelUrl}`, error);
      },
    );
  }

  return group;
}

// Tạo 64 đá bằng InstancedMesh và lưu collider hình tròn XZ. Mặc định dùng
// DodecahedronGeometry; lesson có thể truyền modelUrl để thay bằng GLB.
export function createRocks(
  random,
  colliders,
  {
    modelUrl = null,
    modelLoader = null,
    castShadow = true,
    receiveShadow = true,
    worldHalfExtent = HALF_WORLD,
  } = {},
) {
  const count = 64;
  const targetWidth = 1.35;
  const group = new THREE.Group();
  const geometry = new THREE.DodecahedronGeometry(0.72, 0);
  const material = new THREE.MeshStandardMaterial({
    color: "#6a726d",
    roughness: 0.94,
  });
  const rocks = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const placements = [];

  for (let index = 0; index < count; index += 1) {
    let x;
    let z;
    do {
      x = (random() * 2 - 1) * (worldHalfExtent - 2);
      z = (random() * 2 - 1) * (worldHalfExtent - 2);
    } while (
      Math.abs(x - pathCenterX(z)) < 2.15 ||
      Math.hypot(x - pathCenterX(12), z - 12) < 4
    );

    const scale = 0.42 + random() * 1.18;
    const y = terrainHeight(x, z);
    const rotationX = random() * 0.45;
    const rotationY = random() * Math.PI * 2;
    const rotationZ = random() * 0.35;
    const scaleX = scale * (0.8 + random() * 0.5);
    const scaleZ = scale * (0.75 + random() * 0.55);
    const brightness = random();
    placements.push({
      x,
      y,
      z,
      rotationX,
      rotationY,
      rotationZ,
      scaleX,
      scaleY: scale,
      scaleZ,
      tint: 0.92 + brightness * 0.16,
    });
    dummy.position.set(x, y + 0.38 * scale, z);
    dummy.rotation.set(rotationX, rotationY, rotationZ);
    dummy.scale.set(scaleX, scale, scaleZ);
    dummy.updateMatrix();
    rocks.setMatrixAt(index, dummy.matrix);
    color.setHSL(0.29, 0.05, 0.39 + brightness * 0.1);
    rocks.setColorAt(index, color);
    colliders.push({ x, z, radius: scale * 0.48 });
  }

  rocks.instanceMatrix.needsUpdate = true;
  rocks.instanceColor.needsUpdate = true;
  rocks.castShadow = castShadow;
  rocks.receiveShadow = receiveShadow;
  group.add(rocks);

  // Giữ đá procedural làm fallback trong lúc GLB tải. Model nhập được căn giữa
  // theo XZ, đặt đáy tại Y = 0 rồi dùng chung cho toàn bộ 64 instance.
  if (modelUrl) {
    const loader = modelLoader ?? new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        if (!group.parent) {
          disposeObject(gltf.scene);
          return;
        }

        gltf.scene.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(gltf.scene);
        const size = bounds.getSize(new THREE.Vector3());
        const horizontalSize = Math.max(size.x, size.z);
        const sourceMeshes = [];
        gltf.scene.traverse((object) => {
          if (object.isMesh && object.geometry) sourceMeshes.push(object);
        });

        if (!sourceMeshes.length || horizontalSize <= 0) {
          console.warn(`Model đá không hợp lệ: ${modelUrl}`);
          disposeObject(gltf.scene);
          return;
        }

        const center = bounds.getCenter(new THREE.Vector3());
        const fittedScale = targetWidth / horizontalSize;
        const importedMeshes = [];

        for (const sourceMesh of sourceMeshes) {
          const importedGeometry = sourceMesh.geometry.clone();
          importedGeometry.applyMatrix4(sourceMesh.matrixWorld);
          importedGeometry.translate(-center.x, -bounds.min.y, -center.z);
          importedGeometry.scale(fittedScale, fittedScale, fittedScale);

          const sourceMaterials = Array.isArray(sourceMesh.material)
            ? sourceMesh.material
            : [sourceMesh.material];
          const materials = sourceMaterials.map((sourceMaterial) =>
            sourceMaterial.clone(),
          );
          const importedMaterial = Array.isArray(sourceMesh.material)
            ? materials
            : materials[0];
          const instances = new THREE.InstancedMesh(
            importedGeometry,
            importedMaterial,
            count,
          );
          instances.name = `boulder-${sourceMesh.name || importedMeshes.length}`;

          placements.forEach((placement, index) => {
            dummy.position.set(
              placement.x,
              placement.y - 0.03 * placement.scaleY,
              placement.z,
            );
            dummy.rotation.set(
              placement.rotationX,
              placement.rotationY,
              placement.rotationZ,
            );
            dummy.scale.set(
              placement.scaleX,
              placement.scaleY,
              placement.scaleZ,
            );
            dummy.updateMatrix();
            instances.setMatrixAt(index, dummy.matrix);
            color.setRGB(placement.tint, placement.tint, placement.tint);
            instances.setColorAt(index, color);
          });

          instances.instanceMatrix.needsUpdate = true;
          instances.instanceColor.needsUpdate = true;
          instances.castShadow = castShadow;
          instances.receiveShadow = receiveShadow;
          importedMeshes.push(instances);
        }

        group.remove(rocks);
        rocks.geometry.dispose();
        rocks.material.dispose();
        group.add(...importedMeshes);
        disposeObject(gltf.scene);
      },
      undefined,
      (error) => {
        console.error(`Không tải được model đá ${modelUrl}`, error);
      },
    );
  }

  return group;
}

// Tạo một số thân cây rỗng làm landmark gần đường mòn. Collider hiện tại của
// game là hình tròn XZ nên mỗi log dùng một bán kính bao gần đúng toàn vật thể.
export function createLogs(
  random,
  colliders,
  avoidColliders = [],
  {
    modelUrl = null,
    modelLoader = null,
    castShadow = true,
    receiveShadow = true,
    worldHalfExtent = HALF_WORLD,
  } = {},
) {
  const count = 4;
  const targetLength = 2.6;
  const group = new THREE.Group();
  const geometry = new THREE.CylinderGeometry(0.52, 0.6, 2.6, 10, 1, true);
  geometry.rotateZ(Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({
    color: "#765039",
    roughness: 1,
    side: THREE.DoubleSide,
  });
  const logs = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const placements = [];

  for (let index = 0; index < count; index += 1) {
    const scale = 0.72 + random() * 0.2;
    const radius = 1.1 * scale;
    let x;
    let z;
    let attempts = 0;

    do {
      z = (random() * 2 - 1) * (worldHalfExtent - 5);
      const side = random() < 0.5 ? -1 : 1;
      x = pathCenterX(z) + side * (3.2 + random() * 3.3);
      attempts += 1;
    } while (
      attempts < 80 &&
      (Math.hypot(x - pathCenterX(12), z - 12) < 9 ||
        avoidColliders.some(
          (other) =>
            Math.hypot(x - other.x, z - other.z) <
            radius + other.radius + 0.45,
        ) ||
        colliders.some(
          (other) =>
            Math.hypot(x - other.x, z - other.z) <
            radius + other.radius + 0.8,
        ))
    );

    const y = terrainHeight(x, z);
    const rotationY = random() * Math.PI * 2;
    const scaleX = scale * (0.9 + random() * 0.16);
    const scaleY = scale * (0.9 + random() * 0.14);
    const scaleZ = scale * (0.94 + random() * 0.18);
    const tint = 0.92 + random() * 0.13;
    placements.push({
      x,
      y,
      z,
      rotationY,
      scaleX,
      scaleY,
      scaleZ,
      tint,
    });

    dummy.position.set(x, y + 0.5 * scaleY, z);
    dummy.rotation.set(0, rotationY, 0);
    dummy.scale.set(scaleX, scaleY, scaleZ);
    dummy.updateMatrix();
    logs.setMatrixAt(index, dummy.matrix);
    color.setRGB(tint, tint, tint);
    logs.setColorAt(index, color);
    colliders.push({ x, z, radius });
  }

  logs.instanceMatrix.needsUpdate = true;
  logs.instanceColor.needsUpdate = true;
  logs.castShadow = castShadow;
  logs.receiveShadow = receiveShadow;
  group.add(logs);

  // Dùng cylinder rỗng làm fallback trong lúc GLB tải; khi tải xong model được
  // chuẩn hóa theo chiều dài, đặt đáy tại Y = 0 và chia sẻ qua 4 instance.
  if (modelUrl) {
    const loader = modelLoader ?? new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        if (!group.parent) {
          disposeObject(gltf.scene);
          return;
        }

        gltf.scene.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(gltf.scene);
        const size = bounds.getSize(new THREE.Vector3());
        const sourceLength = Math.max(size.x, size.z);
        const sourceMeshes = [];
        gltf.scene.traverse((object) => {
          if (object.isMesh && object.geometry) sourceMeshes.push(object);
        });

        if (!sourceMeshes.length || sourceLength <= 0) {
          console.warn(`Model thân cây rỗng không hợp lệ: ${modelUrl}`);
          disposeObject(gltf.scene);
          return;
        }

        const center = bounds.getCenter(new THREE.Vector3());
        const fittedScale = targetLength / sourceLength;
        const importedMeshes = [];

        for (const sourceMesh of sourceMeshes) {
          const importedGeometry = sourceMesh.geometry.clone();
          importedGeometry.applyMatrix4(sourceMesh.matrixWorld);
          importedGeometry.translate(-center.x, -bounds.min.y, -center.z);
          importedGeometry.scale(fittedScale, fittedScale, fittedScale);

          const sourceMaterials = Array.isArray(sourceMesh.material)
            ? sourceMesh.material
            : [sourceMesh.material];
          const materials = sourceMaterials.map((sourceMaterial) =>
            sourceMaterial.clone(),
          );
          const importedMaterial = Array.isArray(sourceMesh.material)
            ? materials
            : materials[0];
          const instances = new THREE.InstancedMesh(
            importedGeometry,
            importedMaterial,
            count,
          );
          instances.name = `hollow-log-${sourceMesh.name || importedMeshes.length}`;

          placements.forEach((placement, index) => {
            dummy.position.set(
              placement.x,
              placement.y - 0.08 * placement.scaleY,
              placement.z,
            );
            dummy.rotation.set(0, placement.rotationY, 0);
            dummy.scale.set(
              placement.scaleX,
              placement.scaleY,
              placement.scaleZ,
            );
            dummy.updateMatrix();
            instances.setMatrixAt(index, dummy.matrix);
            color.setRGB(placement.tint, placement.tint, placement.tint);
            instances.setColorAt(index, color);
          });

          instances.instanceMatrix.needsUpdate = true;
          instances.instanceColor.needsUpdate = true;
          instances.castShadow = castShadow;
          instances.receiveShadow = receiveShadow;
          importedMeshes.push(instances);
        }

        group.remove(logs);
        logs.geometry.dispose();
        logs.material.dispose();
        group.add(...importedMeshes);
        disposeObject(gltf.scene);
      },
      undefined,
      (error) => {
        console.error(`Không tải được model thân cây rỗng ${modelUrl}`, error);
      },
    );
  }

  return group;
}

// Tạo shrub nhiều thân ở lớp trung cảnh. Collider chỉ bao phần lõi thân để
// player có thể chạm/lướt qua mép tán lá mà không bị chặn quá sớm.
export function createShrubs(
  random,
  colliders,
  avoidColliders = [],
  {
    modelUrl = null,
    modelLoader = null,
    castShadow = true,
    receiveShadow = true,
    worldHalfExtent = HALF_WORLD,
  } = {},
) {
  const count = 28;
  const targetHeight = 2.4;
  const group = new THREE.Group();
  const geometry = new THREE.DodecahedronGeometry(0.8, 1);
  const material = new THREE.MeshStandardMaterial({
    color: "#486b37",
    roughness: 0.96,
    flatShading: true,
  });
  const shrubs = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const placements = [];

  for (let index = 0; index < count; index += 1) {
    const scale = 0.7 + random() * 0.55;
    const radius = 0.44 * scale;
    let x;
    let z;
    let attempts = 0;

    do {
      x = (random() * 2 - 1) * (worldHalfExtent - 2.5);
      z = (random() * 2 - 1) * (worldHalfExtent - 2.5);
      attempts += 1;
    } while (
      attempts < 100 &&
      (Math.abs(x - pathCenterX(z)) < 2.25 ||
        Math.hypot(x - pathCenterX(12), z - 12) < 7.5 ||
        avoidColliders.some(
          (other) =>
            Math.hypot(x - other.x, z - other.z) <
            radius + other.radius + 0.35,
        ) ||
        colliders.some(
          (other) =>
            Math.hypot(x - other.x, z - other.z) <
            radius + other.radius + 0.6,
        ))
    );

    const y = terrainHeight(x, z);
    const rotationY = random() * Math.PI * 2;
    const scaleX = scale * (0.9 + random() * 0.2);
    const scaleY = scale * (0.9 + random() * 0.22);
    const scaleZ = scale * (0.9 + random() * 0.2);
    const hue = 0.28 + random() * 0.025;
    const lightness = 0.31 + random() * 0.08;
    placements.push({
      x,
      y,
      z,
      rotationY,
      scaleX,
      scaleY,
      scaleZ,
      tint: 0.91 + random() * 0.13,
    });

    dummy.position.set(x, y + 0.72 * scaleY, z);
    dummy.rotation.set(0, rotationY, 0);
    dummy.scale.set(scaleX, scaleY, scaleZ);
    dummy.updateMatrix();
    shrubs.setMatrixAt(index, dummy.matrix);
    color.setHSL(hue, 0.34, lightness);
    shrubs.setColorAt(index, color);
    colliders.push({ x, z, radius });
  }

  shrubs.instanceMatrix.needsUpdate = true;
  shrubs.instanceColor.needsUpdate = true;
  shrubs.castShadow = castShadow;
  shrubs.receiveShadow = receiveShadow;
  group.add(shrubs);

  // Giữ khối foliage low-poly làm fallback trong lúc GLB tải. Model thật được
  // căn gốc xuống terrain và dùng chung qua toàn bộ instance.
  if (modelUrl) {
    const loader = modelLoader ?? new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        if (!group.parent) {
          disposeObject(gltf.scene);
          return;
        }

        gltf.scene.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(gltf.scene);
        const sourceHeight = bounds.getSize(new THREE.Vector3()).y;
        const sourceMeshes = [];
        gltf.scene.traverse((object) => {
          if (object.isMesh && object.geometry) sourceMeshes.push(object);
        });

        if (!sourceMeshes.length || sourceHeight <= 0) {
          console.warn(`Model shrub không hợp lệ: ${modelUrl}`);
          disposeObject(gltf.scene);
          return;
        }

        const center = bounds.getCenter(new THREE.Vector3());
        const fittedScale = targetHeight / sourceHeight;
        const importedMeshes = [];

        for (const sourceMesh of sourceMeshes) {
          const importedGeometry = sourceMesh.geometry.clone();
          importedGeometry.applyMatrix4(sourceMesh.matrixWorld);
          importedGeometry.translate(-center.x, -bounds.min.y, -center.z);
          importedGeometry.scale(fittedScale, fittedScale, fittedScale);

          const sourceMaterials = Array.isArray(sourceMesh.material)
            ? sourceMesh.material
            : [sourceMesh.material];
          const materials = sourceMaterials.map((sourceMaterial) =>
            sourceMaterial.clone(),
          );
          const importedMaterial = Array.isArray(sourceMesh.material)
            ? materials
            : materials[0];
          const instances = new THREE.InstancedMesh(
            importedGeometry,
            importedMaterial,
            count,
          );
          instances.name = `leafy-shrub-${sourceMesh.name || importedMeshes.length}`;

          placements.forEach((placement, index) => {
            dummy.position.set(placement.x, placement.y, placement.z);
            dummy.rotation.set(0, placement.rotationY, 0);
            dummy.scale.set(
              placement.scaleX,
              placement.scaleY,
              placement.scaleZ,
            );
            dummy.updateMatrix();
            instances.setMatrixAt(index, dummy.matrix);
            color.setRGB(placement.tint, placement.tint, placement.tint);
            instances.setColorAt(index, color);
          });

          instances.instanceMatrix.needsUpdate = true;
          instances.instanceColor.needsUpdate = true;
          instances.castShadow = castShadow;
          instances.receiveShadow = receiveShadow;
          importedMeshes.push(instances);
        }

        group.remove(shrubs);
        shrubs.geometry.dispose();
        shrubs.material.dispose();
        group.add(...importedMeshes);
        disposeObject(gltf.scene);
      },
      undefined,
      (error) => {
        console.error(`Không tải được model shrub ${modelUrl}`, error);
      },
    );
  }

  return group;
}

// Tạo các bụi berry thân gỗ thành điểm nhấn dọc đường mòn. Collider nhỏ chỉ
// bao phần gốc để tán lá không làm player bị chặn từ quá xa.
export function createBerryBushes(
  random,
  colliders,
  avoidColliders = [],
  {
    modelUrl = null,
    modelLoader = null,
    castShadow = true,
    receiveShadow = true,
    worldHalfExtent = HALF_WORLD,
  } = {},
) {
  const count = 18;
  const targetHeight = 1.65;
  const group = new THREE.Group();
  const geometry = new THREE.DodecahedronGeometry(0.72, 1);
  const material = new THREE.MeshStandardMaterial({
    color: "#5f793f",
    roughness: 0.96,
    flatShading: true,
  });
  const bushes = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const placements = [];

  for (let index = 0; index < count; index += 1) {
    const scale = 0.75 + random() * 0.4;
    const radius = 0.34 * scale;
    let x;
    let z;
    let attempts = 0;

    do {
      z = (random() * 2 - 1) * (worldHalfExtent - 4);
      const side = random() < 0.5 ? -1 : 1;
      x = pathCenterX(z) + side * (2.35 + random() * 4.2);
      attempts += 1;
    } while (
      attempts < 100 &&
      (Math.hypot(x - pathCenterX(12), z - 12) < 6.5 ||
        avoidColliders.some(
          (other) =>
            Math.hypot(x - other.x, z - other.z) <
            radius + other.radius + 0.35,
        ) ||
        colliders.some(
          (other) =>
            Math.hypot(x - other.x, z - other.z) <
            radius + other.radius + 0.75,
        ))
    );

    const y = terrainHeight(x, z);
    const rotationY = random() * Math.PI * 2;
    const scaleX = scale * (0.9 + random() * 0.2);
    const scaleY = scale * (0.92 + random() * 0.16);
    const scaleZ = scale * (0.9 + random() * 0.2);
    const tint = 0.92 + random() * 0.12;
    placements.push({
      x,
      y,
      z,
      rotationY,
      scaleX,
      scaleY,
      scaleZ,
      tint,
    });

    dummy.position.set(x, y + 0.65 * scaleY, z);
    dummy.rotation.set(0, rotationY, 0);
    dummy.scale.set(scaleX, scaleY, scaleZ);
    dummy.updateMatrix();
    bushes.setMatrixAt(index, dummy.matrix);
    color.setHSL(0.25 + random() * 0.025, 0.36, 0.34 + random() * 0.07);
    bushes.setColorAt(index, color);
    colliders.push({ x, z, radius });
  }

  bushes.instanceMatrix.needsUpdate = true;
  bushes.instanceColor.needsUpdate = true;
  bushes.castShadow = castShadow;
  bushes.receiveShadow = receiveShadow;
  group.add(bushes);

  // Giữ bụi low-poly làm fallback trong lúc GLB tải; model thật được căn gốc
  // xuống terrain và chia sẻ geometry/material cho toàn bộ instance.
  if (modelUrl) {
    const loader = modelLoader ?? new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        if (!group.parent) {
          disposeObject(gltf.scene);
          return;
        }

        gltf.scene.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(gltf.scene);
        const sourceHeight = bounds.getSize(new THREE.Vector3()).y;
        const sourceMeshes = [];
        gltf.scene.traverse((object) => {
          if (object.isMesh && object.geometry) sourceMeshes.push(object);
        });

        if (!sourceMeshes.length || sourceHeight <= 0) {
          console.warn(`Model berry bush không hợp lệ: ${modelUrl}`);
          disposeObject(gltf.scene);
          return;
        }

        const center = bounds.getCenter(new THREE.Vector3());
        const fittedScale = targetHeight / sourceHeight;
        const importedMeshes = [];

        for (const sourceMesh of sourceMeshes) {
          const importedGeometry = sourceMesh.geometry.clone();
          importedGeometry.applyMatrix4(sourceMesh.matrixWorld);
          importedGeometry.translate(-center.x, -bounds.min.y, -center.z);
          importedGeometry.scale(fittedScale, fittedScale, fittedScale);

          const sourceMaterials = Array.isArray(sourceMesh.material)
            ? sourceMesh.material
            : [sourceMesh.material];
          const materials = sourceMaterials.map((sourceMaterial) =>
            sourceMaterial.clone(),
          );
          const importedMaterial = Array.isArray(sourceMesh.material)
            ? materials
            : materials[0];
          const instances = new THREE.InstancedMesh(
            importedGeometry,
            importedMaterial,
            count,
          );
          instances.name = `berry-bush-${sourceMesh.name || importedMeshes.length}`;

          placements.forEach((placement, index) => {
            dummy.position.set(placement.x, placement.y, placement.z);
            dummy.rotation.set(0, placement.rotationY, 0);
            dummy.scale.set(
              placement.scaleX,
              placement.scaleY,
              placement.scaleZ,
            );
            dummy.updateMatrix();
            instances.setMatrixAt(index, dummy.matrix);
            color.setRGB(placement.tint, placement.tint, placement.tint);
            instances.setColorAt(index, color);
          });

          instances.instanceMatrix.needsUpdate = true;
          instances.instanceColor.needsUpdate = true;
          instances.castShadow = castShadow;
          instances.receiveShadow = receiveShadow;
          importedMeshes.push(instances);
        }

        group.remove(bushes);
        bushes.geometry.dispose();
        bushes.material.dispose();
        group.add(...importedMeshes);
        disposeObject(gltf.scene);
      },
      undefined,
      (error) => {
        console.error(`Không tải được model berry bush ${modelUrl}`, error);
      },
    );
  }

  return group;
}

// Tạo một Ancient Oak duy nhất làm landmark ở clearing gần đường mòn. Collider
// được thêm vào treeColliders để dùng chung cho player collision và camera.
export function createAncientOak(
  colliders,
  { modelUrl = null, modelLoader = null, position = null, rotationY = -0.28 } = {},
) {
  const targetHeight = 8.5;
  const z = position?.z ?? 2;
  const x = position?.x ?? pathCenterX(z) + 6;
  const y = terrainHeight(x, z);
  const group = new THREE.Group();
  group.name = "ancient-oak";
  group.position.set(x, y, z);
  group.rotation.y = rotationY;

  const fallback = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.72, 1.18, 4.6, 10),
    new THREE.MeshStandardMaterial({
      color: "#68462f",
      roughness: 1,
      flatShading: true,
    }),
  );
  trunk.position.y = 2.3;
  const crown = new THREE.Mesh(
    new THREE.DodecahedronGeometry(3.25, 1),
    new THREE.MeshStandardMaterial({
      color: "#486b37",
      roughness: 0.96,
      flatShading: true,
    }),
  );
  crown.position.y = 6.1;
  crown.scale.y = 0.78;
  for (const mesh of [trunk, crown]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  fallback.add(trunk, crown);
  group.add(fallback);

  colliders.push({
    x,
    z,
    radius: 1.15,
    cameraRadius: 4.9,
  });

  if (modelUrl) {
    const loader = modelLoader ?? new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        if (!group.parent) {
          disposeObject(gltf.scene);
          return;
        }

        gltf.scene.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(gltf.scene);
        const sourceHeight = bounds.getSize(new THREE.Vector3()).y;
        if (sourceHeight <= 0) {
          console.warn(`Model Ancient Oak không hợp lệ: ${modelUrl}`);
          disposeObject(gltf.scene);
          return;
        }

        const center = bounds.getCenter(new THREE.Vector3());
        const fittedScale = targetHeight / sourceHeight;
        gltf.scene.scale.setScalar(fittedScale);
        gltf.scene.position.set(
          -center.x * fittedScale,
          -bounds.min.y * fittedScale,
          -center.z * fittedScale,
        );
        gltf.scene.traverse((object) => {
          if (!object.isMesh) return;
          object.castShadow = true;
          object.receiveShadow = true;
        });

        group.remove(fallback);
        disposeObject(fallback);
        group.add(gltf.scene);
      },
      undefined,
      (error) => {
        console.error(`Không tải được model Ancient Oak ${modelUrl}`, error);
      },
    );
  }

  return group;
}

// Tạo 1.600 cụm cỏ tam giác. Cỏ chỉ để trang trí nên không có collider.
export function createGrass(
  random,
  {
    chunkSize = 0,
    castShadow = false,
    receiveShadow = true,
    worldHalfExtent = HALF_WORLD,
  } = {},
) {
  const count = 1600;
  const geometry = new THREE.ConeGeometry(0.095, 0.55, 3);
  geometry.translate(0, 0.275, 0);
  const material = new THREE.MeshStandardMaterial({
    color: "#6f8f48",
    roughness: 1,
  });
  const grass = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const placements = [];

  let created = 0;
  while (created < count) {
    const x = (random() * 2 - 1) * (worldHalfExtent - 1);
    const z = (random() * 2 - 1) * (worldHalfExtent - 1);
    if (Math.abs(x - pathCenterX(z)) < 1.65) continue;
    const scale = 0.65 + random() * 0.85;
    placements.push({ x, z });
    dummy.position.set(x, terrainHeight(x, z) + 0.015, z);
    dummy.rotation.set(0, random() * Math.PI * 2, (random() - 0.5) * 0.15);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    grass.setMatrixAt(created, dummy.matrix);
    color.setHSL(0.23 + random() * 0.055, 0.38, 0.35 + random() * 0.12);
    grass.setColorAt(created, color);
    created += 1;
  }

  grass.instanceMatrix.needsUpdate = true;
  grass.instanceColor.needsUpdate = true;
  grass.castShadow = castShadow;
  grass.receiveShadow = receiveShadow;
  if (!chunkSize || chunkSize <= 0) return grass;

  const group = new THREE.Group();
  group.name = "grass-spatial-chunks";
  group.add(...createSpatialChunks(grass, placements, chunkSize, "grass"));
  return group;
}

// Tạo các khối núi low-poly ở rìa map để che đường chân trời.
export function createMountains({ worldHalfExtent = HALF_WORLD } = {}) {
  const group = new THREE.Group();
  const geometry = new THREE.ConeGeometry(1, 1, 7);
  const material = new THREE.MeshStandardMaterial({
    color: "#52665f",
    roughness: 1,
    flatShading: true,
  });
  const placements = [
    [-43, -36, 13, 11],
    [-30, -46, 11, 15],
    [-12, -48, 15, 18],
    [9, -49, 12, 14],
    [29, -46, 16, 19],
    [44, -31, 12, 15],
    [46, 18, 14, 18],
    [-46, 25, 13, 17],
  ];
  const worldScale = worldHalfExtent / HALF_WORLD;
  for (const [baseX, baseZ, radius, height] of placements) {
    const x = baseX * worldScale;
    const z = baseZ * worldScale;
    const mountain = new THREE.Mesh(geometry, material);
    mountain.position.set(x, terrainHeight(x, z) + height * 0.5 - 1, z);
    mountain.scale.set(radius, height, radius);
    mountain.rotation.y = (x + z) * 0.17;
    mountain.castShadow = true;
    mountain.receiveShadow = true;
    group.add(mountain);
  }
  return group;
}

// Bộ random có seed: cùng seed luôn tạo cùng một bố cục cây, đá và cỏ.
export function mulberry32(seed) {
  return function random() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// Giải phóng geometry/material nếu GLB tải xong sau khi lesson đã bị đóng.
export function disposeObject(root) {
  root.traverse((object) => {
    object.geometry?.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) material?.dispose();
  });
}
