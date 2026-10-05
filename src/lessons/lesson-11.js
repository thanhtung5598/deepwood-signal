import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  HALF_WORLD,
  createAncientOak,
  createBerryBushes,
  createGrass,
  createLogs,
  createMountains,
  createRocks,
  createShrubs,
  createTerrain,
  createTrail,
  createTrees,
  disposeObject,
  mulberry32,
  pathCenterX,
  terrainHeight,
} from "./lesson-10.js";

export default {
  title: "First-person và third-person camera",
  description:
    "V: đổi góc nhìn · Click scene: khóa chuột · Mouse: xoay hướng nhìn · WASD di chuyển theo hướng camera.",
  usesKeyboard: true,

  setup({ scene, camera, renderer, pressedKeys }) {
    // ---------------------------------------------------------------------
    // 1. CẤU HÌNH CẢNH
    // Lesson 11 dùng lại các hàm tạo môi trường từ Lesson 10, nhưng thay toàn
    // bộ controller camera để hỗ trợ góc nhìn thứ nhất và thứ ba.
    // ---------------------------------------------------------------------
    const previousFog = scene.fog;
    const previousFar = camera.far;
    const previousShadowEnabled = renderer.shadowMap.enabled;
    const previousShadowType = renderer.shadowMap.type;
    const previousToneMapping = renderer.toneMapping;
    const previousToneMappingExposure = renderer.toneMappingExposure;

    scene.background = new THREE.Color("#9bc5d0");
    scene.fog = new THREE.FogExp2("#9bb8b3", 0.018);
    camera.far = 150;
    camera.updateProjectionMatrix();
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

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

    // ---------------------------------------------------------------------
    // 2. TẠO TERRAIN VÀ CÁC INSTANCED MESH
    // ---------------------------------------------------------------------
    const terrain = createTerrain();
    const trail = createTrail();
    const random = mulberry32(104729);
    const treeColliders = [];
    const rockColliders = [];
    const logColliders = [];
    const shrubColliders = [];
    const berryBushColliders = [];
    const trees = createTrees(random, treeColliders, {
      modelUrl: "/models/stylized-layered-evergreen-tree.glb",
    });
    const ancientOak = createAncientOak(treeColliders, {
      modelUrl: "/models/majestic-ancient-oak.glb",
    });
    const rocks = createRocks(random, rockColliders, {
      modelUrl: "/models/mossy-faceted-boulder.glb",
    });
    const logs = createLogs(
      random,
      logColliders,
      [...treeColliders, ...rockColliders],
      { modelUrl: "/models/weathered-hollow-log.glb" },
    );
    const shrubs = createShrubs(
      random,
      shrubColliders,
      [...treeColliders, ...rockColliders, ...logColliders],
      { modelUrl: "/models/stylized-multi-trunk-leafy-shrub.glb" },
    );
    const berryBushes = createBerryBushes(
      random,
      berryBushColliders,
      [
        ...treeColliders,
        ...rockColliders,
        ...logColliders,
        ...shrubColliders,
      ],
      { modelUrl: "/models/bountiful-red-berry-bush.glb" },
    );
    const grass = createGrass(random);
    const mountains = createMountains();
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
    );

    // ---------------------------------------------------------------------
    // 3. PLAYER ROOT
    // playerRoot giữ vị trí gameplay; model robot chỉ là phần hình ảnh bên trong.
    // ---------------------------------------------------------------------
    const spawnX = pathCenterX(12);
    const playerRoot = new THREE.Group();
    playerRoot.position.set(spawnX, terrainHeight(spawnX, 12), 12);
    scene.add(playerRoot);

    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.74, 40),
      new THREE.MeshBasicMaterial({
        color: "#fbbf24",
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.035;
    playerRoot.add(marker);

    // ---------------------------------------------------------------------
    // 4. HUD
    // ---------------------------------------------------------------------
    const hud = document.createElement("section");
    hud.className = "character-hud camera-hud";
    hud.innerHTML = `
      <div class="character-hud__heading">
        <strong>Camera Controller</strong>
        <span data-field="lock">Click scene để điều khiển chuột</span>
      </div>
      <dl>
        <dt>Góc nhìn</dt><dd data-field="view">Thứ ba</dd>
        <dt>Animation</dt><dd data-field="state">—</dd>
        <dt>Mouse yaw</dt><dd data-field="yaw">0°</dd>
      </dl>
      <div class="control-keys" aria-label="Điều khiển camera và nhân vật">
        <span><kbd>V</kbd> đổi camera</span>
        <span><kbd>WASD</kbd> di chuyển</span>
        <span><kbd>Shift</kbd> chạy</span>
        <span><kbd>Space</kbd> nhảy</span>
      </div>
    `;
    document.querySelector(".stage").append(hud);

    const lockField = hud.querySelector("[data-field='lock']");
    const viewField = hud.querySelector("[data-field='view']");
    const stateField = hud.querySelector("[data-field='state']");
    const yawField = hud.querySelector("[data-field='yaw']");
    const canvas = renderer.domElement;

    // ---------------------------------------------------------------------
    // 5. TRẠNG THÁI PLAYER VÀ CAMERA
    // yaw là hướng quay ngang; pitch là góc nhìn lên/xuống.
    // cameraMode có hai giá trị: "third" hoặc "first".
    // ---------------------------------------------------------------------
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
    let cameraMode = "third";
    let yaw = 0;
    let pitch = 0.18;
    let mouseDragging = false;
    let jumpWasPressed = false;
    let disposed = false;

    // Các vector này được tái sử dụng trong game loop.
    const flatForward = new THREE.Vector3();
    const cameraRight = new THREE.Vector3();
    const moveDirection = new THREE.Vector3();
    const desiredCamera = new THREE.Vector3();
    const cameraTarget = new THREE.Vector3();
    const lookDirection = new THREE.Vector3();
    const targetFacing = new THREE.Quaternion();

    // ---------------------------------------------------------------------
    // 6. MOUSE LOOK
    // Pointer Lock cho phép rê chuột liên tục. Nếu trình duyệt chưa khóa chuột,
    // người dùng vẫn có thể giữ chuột trái và kéo để xoay camera.
    // ---------------------------------------------------------------------
    function onCanvasClick() {
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
      }
    }

    function onMouseDown(event) {
      if (event.button === 0) mouseDragging = true;
    }

    function onMouseUp(event) {
      if (event.button === 0) mouseDragging = false;
    }

    function onMouseMove(event) {
      const pointerLocked = document.pointerLockElement === canvas;
      if (!pointerLocked && !mouseDragging) return;

      yaw -= event.movementX * 0.0025;
      pitch = THREE.MathUtils.clamp(
        pitch - event.movementY * 0.002,
        cameraMode === "first" ? -1.05 : -0.2,
        cameraMode === "first" ? 1.05 : 0.68,
      );
      yawField.textContent = `${Math.round(THREE.MathUtils.radToDeg(yaw))}°`;
    }

    function onPointerLockChange() {
      lockField.textContent =
        document.pointerLockElement === canvas
          ? "Mouse đang điều khiển camera · ESC để thoát"
          : "Click scene để điều khiển chuột";
    }

    // Dùng keydown thay vì polling để một lần bấm V thật nhanh vẫn được nhận.
    function onViewKeyDown(event) {
      if (event.code === "KeyV" && !event.repeat) toggleCameraMode();
    }

    canvas.addEventListener("click", onCanvasClick);
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("keydown", onViewKeyDown);
    document.addEventListener("pointerlockchange", onPointerLockChange);

    // ---------------------------------------------------------------------
    // 7. ANIMATION STATE MACHINE
    // ---------------------------------------------------------------------
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
    // 8. TẢI ROBOT
    // Ở góc nhìn thứ nhất model được ẩn để camera không nằm bên trong đầu robot.
    // ---------------------------------------------------------------------
    const loader = new GLTFLoader();
    loader.load(
      "/models/futuristic-robot-v2-animated.glb",
      (gltf) => {
        if (disposed) {
          disposeObject(gltf.scene);
          return;
        }

        player.model = gltf.scene;
        player.model.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(player.model);
        const sourceHeight = bounds.getSize(new THREE.Vector3()).y;
        player.model.scale.setScalar(
          sourceHeight > 0 ? 2.15 / sourceHeight : 1,
        );
        player.model.updateMatrixWorld(true);
        bounds.setFromObject(player.model);
        const center = bounds.getCenter(new THREE.Vector3());
        player.model.position.set(-center.x, -bounds.min.y, -center.z);
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
      (error) => {
        console.error("Không tải được robot cho Lesson 11", error);
        lockField.textContent = "Lỗi tải robot";
        lockField.classList.add("is-error");
      },
    );

    // ---------------------------------------------------------------------
    // 9. COLLISION PLAYER VỚI CÂY/ĐÁ
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

    // Camera thứ ba tự tiến gần nếu có tán cây nằm giữa camera và robot.
    function preventCameraOcclusion(target, desired) {
      const rayX = desired.x - target.x;
      const rayZ = desired.z - target.z;
      const rayLengthSquared = rayX * rayX + rayZ * rayZ;
      const rayLength = Math.sqrt(rayLengthSquared);
      let allowedAmount = 1;

      for (const tree of treeColliders) {
        const amount = THREE.MathUtils.clamp(
          ((tree.x - target.x) * rayX + (tree.z - target.z) * rayZ) /
            rayLengthSquared,
          0,
          1,
        );
        if (amount < 0.18 || amount >= allowedAmount) continue;
        const closestX = target.x + rayX * amount;
        const closestZ = target.z + rayZ * amount;
        if (
          Math.hypot(tree.x - closestX, tree.z - closestZ) >= tree.cameraRadius
        ) {
          continue;
        }
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
    // 10. ĐỔI CAMERA BẰNG PHÍM V
    // ---------------------------------------------------------------------
    function toggleCameraMode() {
      cameraMode = cameraMode === "third" ? "first" : "third";
      viewField.textContent = cameraMode === "third" ? "Thứ ba" : "Thứ nhất";
      marker.visible = cameraMode === "third";
      if (player.model) player.model.visible = cameraMode === "third";
      pitch = THREE.MathUtils.clamp(
        pitch,
        cameraMode === "first" ? -1.05 : -0.2,
        cameraMode === "first" ? 1.05 : 0.68,
      );
    }

    // ---------------------------------------------------------------------
    // 11. GAME LOOP
    // Mouse tạo flatForward. WASD được chiếu theo flatForward/cameraRight nên
    // hướng di chuyển luôn đi theo hướng camera thay vì theo trục world cố định.
    // ---------------------------------------------------------------------
    function update(deltaTime) {
      flatForward.set(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
      cameraRight.set(-flatForward.z, 0, flatForward.x).normalize();

      const forwardInput =
        (pressedKeys.has("KeyW") || pressedKeys.has("ArrowUp") ? 1 : 0) -
        (pressedKeys.has("KeyS") || pressedKeys.has("ArrowDown") ? 1 : 0);
      const rightInput =
        (pressedKeys.has("KeyD") || pressedKeys.has("ArrowRight") ? 1 : 0) -
        (pressedKeys.has("KeyA") || pressedKeys.has("ArrowLeft") ? 1 : 0);
      moveDirection
        .copy(flatForward)
        .multiplyScalar(forwardInput)
        .addScaledVector(cameraRight, rightInput);

      const moving = moveDirection.lengthSq() > 0;
      const running =
        pressedKeys.has("ShiftLeft") || pressedKeys.has("ShiftRight");
      if (moving) moveDirection.normalize();

      const targetSpeed = moving ? (running ? 5.3 : 3.05) : 0;
      player.targetVelocity.copy(moveDirection).multiplyScalar(targetSpeed);
      player.velocity.lerp(
        player.targetVelocity,
        1 - Math.exp(-(moving ? 8 : 11) * deltaTime),
      );
      if (!moving && player.velocity.lengthSq() < 0.0004) {
        player.velocity.set(0, 0, 0);
      }

      playerRoot.position.addScaledVector(player.velocity, deltaTime);
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

      if (moving) {
        targetFacing.setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          Math.atan2(moveDirection.x, moveDirection.z),
        );
        playerRoot.quaternion.slerp(
          targetFacing,
          1 - Math.exp(-13 * deltaTime),
        );
      }

      const jumpPressed = pressedKeys.has("Space");
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

      const groundHeight = terrainHeight(
        playerRoot.position.x,
        playerRoot.position.z,
      );
      playerRoot.position.y = groundHeight + player.jumpHeight;
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

      // ---------------------------------------------------------------
      // CAMERA THỨ NHẤT: camera nằm tại đầu robot và nhìn theo yaw + pitch.
      // ---------------------------------------------------------------
      if (cameraMode === "first") {
        const cosPitch = Math.cos(pitch);
        lookDirection.set(
          -Math.sin(yaw) * cosPitch,
          Math.sin(pitch),
          -Math.cos(yaw) * cosPitch,
        );
        camera.position.set(
          playerRoot.position.x,
          playerRoot.position.y + 1.78,
          playerRoot.position.z,
        );
        cameraTarget.copy(camera.position).add(lookDirection);
        camera.lookAt(cameraTarget);
      } else {
        // -------------------------------------------------------------
        // CAMERA THỨ BA: camera orbit phía sau hướng nhìn của mouse.
        // Pitch điều khiển độ cao; yaw điều khiển hướng đi khi nhấn W.
        // -------------------------------------------------------------
        cameraTarget.set(
          playerRoot.position.x,
          playerRoot.position.y + 1.15,
          playerRoot.position.z,
        );
        const distance = 4.7;
        desiredCamera
          .copy(cameraTarget)
          .addScaledVector(flatForward, -distance);
        desiredCamera.y += 2.5 + pitch * 2.8;
        preventCameraOcclusion(cameraTarget, desiredCamera);
        camera.position.lerp(desiredCamera, 1 - Math.exp(-7 * deltaTime));
        camera.lookAt(cameraTarget);
      }

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
        disposed = true;
        player.mixer?.stopAllAction();
        if (player.mixer && player.model) {
          player.mixer.uncacheRoot(player.model);
        }
        canvas.removeEventListener("click", onCanvasClick);
        canvas.removeEventListener("mousedown", onMouseDown);
        window.removeEventListener("mouseup", onMouseUp);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("keydown", onViewKeyDown);
        document.removeEventListener("pointerlockchange", onPointerLockChange);
        if (document.pointerLockElement === canvas)
          document.exitPointerLock?.();
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
