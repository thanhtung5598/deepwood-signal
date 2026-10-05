import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

const ARENA_SIZE = 44;
const FLIGHT_HEIGHT = 2.15;
const FLIGHT_PITCH = 0;
const MODEL_HEADING_OFFSET = Math.PI - Math.PI / 4;

export default {
  title: "Bóng Săn controller và attack",
  description:
    "Click scene: khóa chuột · Mouse: đổi góc nhìn · WASD: bay theo camera · Space hoặc click: lao tấn công.",
  usesKeyboard: true,

  setup({ scene, camera, renderer, pressedKeys }) {
    const previousFog = scene.fog;
    const previousFar = camera.far;
    const previousShadowEnabled = renderer.shadowMap.enabled;
    const previousShadowType = renderer.shadowMap.type;
    const previousToneMapping = renderer.toneMapping;
    const previousExposure = renderer.toneMappingExposure;

    scene.background = new THREE.Color("#849f94");
    scene.fog = new THREE.FogExp2("#849f94", 0.026);
    camera.far = 100;
    camera.updateProjectionMatrix();
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;

    const hemisphere = new THREE.HemisphereLight("#e5f7ef", "#17281f", 2.4);
    const sun = new THREE.DirectionalLight("#fff1c9", 3.5);
    sun.position.set(-10, 18, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -24;
    sun.shadow.camera.right = 24;
    sun.shadow.camera.top = 24;
    sun.shadow.camera.bottom = -24;
    scene.add(hemisphere, sun);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(ARENA_SIZE * 0.72, 64),
      new THREE.MeshStandardMaterial({
        color: "#526f4a",
        roughness: 0.96,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(ARENA_SIZE, 22, "#d7ff67", "#789170");
    grid.position.y = 0.025;
    grid.material.transparent = true;
    grid.material.opacity = 0.26;
    scene.add(grid);

    // Các cột đá giúp người học nhìn rõ tốc độ, hướng bay và độ nghiêng thân.
    const pillarGeometry = new THREE.CylinderGeometry(0.5, 0.8, 2.4, 7);
    const pillarMaterial = new THREE.MeshStandardMaterial({
      color: "#69736c",
      roughness: 0.9,
      flatShading: true,
    });
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2;
      const radius = index % 2 ? 15 : 20;
      const pillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
      pillar.position.set(Math.cos(angle) * radius, 1.2, Math.sin(angle) * radius);
      pillar.rotation.y = angle;
      pillar.scale.y = 0.65 + (index % 3) * 0.18;
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      scene.add(pillar);
    }

    const eagleRoot = new THREE.Group();
    eagleRoot.position.set(0, FLIGHT_HEIGHT, 4);
    scene.add(eagleRoot);

    const fallback = new THREE.Group();
    const fallbackBody = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 1.8, 6),
      new THREE.MeshStandardMaterial({ color: "#391b20", roughness: 0.72 }),
    );
    fallbackBody.rotation.x = -Math.PI / 2;
    const fallbackWings = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 0.06, 0.55),
      new THREE.MeshStandardMaterial({ color: "#502329", roughness: 0.82 }),
    );
    fallback.add(fallbackBody, fallbackWings);
    eagleRoot.add(fallback);

    const target = new THREE.Group();
    target.position.set(0, 0, 14);
    const targetRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.05, 0.09, 10, 40),
      new THREE.MeshBasicMaterial({ color: "#d7ff67" }),
    );
    targetRing.position.y = 1.4;
    const targetCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.34),
      new THREE.MeshStandardMaterial({
        color: "#d7ff67",
        emissive: "#8ab62a",
        emissiveIntensity: 1.8,
      }),
    );
    targetCore.position.y = 1.4;
    target.add(targetRing, targetCore);
    scene.add(target);

    const attackWave = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.48, 32),
      new THREE.MeshBasicMaterial({
        color: "#ff604f",
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    attackWave.rotation.x = -Math.PI / 2;
    attackWave.position.y = 0.05;
    eagleRoot.add(attackWave);

    const hud = document.createElement("section");
    hud.className = "character-hud eagle-hud";
    hud.innerHTML = `
      <div class="character-hud__heading">
        <strong>Bóng Săn Flight Lab</strong>
        <span data-field="load">Đang tải model…</span>
      </div>
      <dl>
        <dt>State</dt><dd data-field="state">glide</dd>
        <dt>Speed</dt><dd data-field="speed">0.0 m/s</dd>
        <dt>Attack</dt><dd data-field="attack">Ready</dd>
        <dt>Camera</dt><dd data-field="camera">Click scene</dd>
        <dt>Wing rig</dt><dd>4 khớp mỗi cánh</dd>
      </dl>
      <div class="control-keys" aria-label="Điều khiển Bóng Săn">
        <span><kbd>WASD</kbd> bay</span>
        <span><kbd>Mouse</kbd> camera</span>
        <span><kbd>Space</kbd> attack</span>
      </div>
    `;
    document.querySelector(".stage").append(hud);

    const loadField = hud.querySelector("[data-field='load']");
    const stateField = hud.querySelector("[data-field='state']");
    const speedField = hud.querySelector("[data-field='speed']");
    const attackField = hud.querySelector("[data-field='attack']");
    const cameraField = hud.querySelector("[data-field='camera']");

    const eagle = {
      model: null,
      visualRig: null,
      wingBones: null,
      velocity: new THREE.Vector3(),
      targetVelocity: new THREE.Vector3(),
      facing: new THREE.Vector3(0, 0, 1),
      attackTime: 0,
      attackCooldown: 0,
      attackRequested: false,
      spaceWasPressed: false,
      state: "glide",
      wingPhase: 0,
      wingSpeed: 4,
      wingAmount: 0.28,
    };
    let disposed = false;

    new GLTFLoader().load(
      "/models/fantasy-bird.glb",
      (gltf) => {
        if (disposed) return;
        gltf.scene.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(gltf.scene);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const largestDimension = Math.max(size.x, size.y, size.z);
        if (largestDimension <= 0) return;

        const model = cloneSkeleton(gltf.scene);
        const visualRig = new THREE.Group();
        const scale = 3.15 / largestDimension;
        visualRig.rotation.x = FLIGHT_PITCH;
        model.scale.setScalar(scale);
        model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
        // Asset được dựng chéo khoảng 45°. Offset này đưa mỏ chim về đúng +Z,
        // cùng hướng với vận tốc của controller.
        model.rotation.y = MODEL_HEADING_OFFSET;
        model.traverse((object) => {
          if (!object.isMesh) return;
          object.castShadow = true;
          object.receiveShadow = true;
          object.frustumCulled = false;
        });
        visualRig.add(model);
        eagleRoot.remove(fallback);
        eagleRoot.add(visualRig);

        const wingPairs = [
          ["bone_6", "bone_10", 1.05, 0, 0.025, 0.28],
          ["bone_7", "bone_11", 0.34, 0.16, 0.055, 0.08],
          ["bone_8", "bone_12", 0.2, 0.34, 0.09, 0.05],
          ["bone_9", "bone_13", 0.12, 0.5, 0.12, 0.03],
        ];
        eagle.wingBones = wingPairs
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
        eagle.model = model;
        eagle.visualRig = visualRig;
        loadField.textContent = eagle.wingBones.length
          ? "Rig cánh sẵn sàng"
          : "Không tìm thấy rig cánh";
      },
      undefined,
      (error) => {
        console.error("Không tải được Bóng Săn cho Lesson 12", error);
        loadField.textContent = "Đang dùng fallback";
        loadField.classList.add("is-error");
      },
    );

    const moveDirection = new THREE.Vector3();
    const desiredCamera = new THREE.Vector3();
    const cameraLookAt = new THREE.Vector3();
    const cameraForward = new THREE.Vector3();
    const cameraRight = new THREE.Vector3();
    const targetQuaternion = new THREE.Quaternion();
    const wingFlapAxis = new THREE.Vector3(0, 0, 1);
    const wingTwistAxis = new THREE.Vector3(1, 0, 0);
    const attackDirection = new THREE.Vector3();
    let elapsed = 0;
    let cameraYaw = 0;
    let cameraPitch = 0.48;
    let mouseDragging = false;
    const cameraDistance = 7.4;

    camera.position.set(0, 6.2, -4);

    function requestAttack() {
      eagle.attackRequested = true;
    }

    const canvas = renderer.domElement;

    function onCanvasClick() {
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
        return;
      }
      requestAttack();
    }

    function onMouseMove(event) {
      if (document.pointerLockElement !== canvas && !mouseDragging) return;
      cameraYaw -= event.movementX * 0.0025;
      cameraPitch = THREE.MathUtils.clamp(
        cameraPitch - event.movementY * 0.002,
        0.08,
        1.08,
      );
    }

    function onPointerLockChange() {
      cameraField.textContent =
        document.pointerLockElement === canvas ? "Mouse active · ESC" : "Click scene";
    }

    function onMouseDown(event) {
      if (event.button === 0) mouseDragging = true;
    }

    function onMouseUp(event) {
      if (event.button === 0) mouseDragging = false;
    }

    canvas.addEventListener("click", onCanvasClick);
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onPointerLockChange);

    function playAttack() {
      if (eagle.attackTime > 0 || eagle.attackCooldown > 0) return;
      eagle.attackTime = 0.72;
      eagle.attackRequested = false;
      attackDirection.copy(eagle.facing);
    }

    function update(deltaTime) {
      elapsed += deltaTime;
      eagle.attackCooldown = Math.max(0, eagle.attackCooldown - deltaTime);

      const spacePressed = pressedKeys.has("Space");
      if (spacePressed && !eagle.spaceWasPressed) eagle.attackRequested = true;
      eagle.spaceWasPressed = spacePressed;
      if (eagle.attackRequested) playAttack();

      const forwardInput =
        (pressedKeys.has("KeyW") || pressedKeys.has("ArrowUp") ? 1 : 0) -
        (pressedKeys.has("KeyS") || pressedKeys.has("ArrowDown") ? 1 : 0);
      const rightInput =
        (pressedKeys.has("KeyD") || pressedKeys.has("ArrowRight") ? 1 : 0) -
        (pressedKeys.has("KeyA") || pressedKeys.has("ArrowLeft") ? 1 : 0);
      // Camera khởi đầu nhìn theo +Z, vì vậy screen-right là -X.
      cameraForward.set(-Math.sin(cameraYaw), 0, Math.cos(cameraYaw));
      cameraRight.set(-Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));
      moveDirection
        .copy(cameraForward)
        .multiplyScalar(forwardInput)
        .addScaledVector(cameraRight, rightInput);
      const moving = moveDirection.lengthSq() > 0;
      if (moving) {
        moveDirection.normalize();
        eagle.facing.lerp(moveDirection, 1 - Math.exp(-8 * deltaTime)).normalize();
      }

      const attacking = eagle.attackTime > 0;
      let attackProgress = 0;
      if (attacking) {
        eagle.attackTime = Math.max(0, eagle.attackTime - deltaTime);
        attackProgress = 1 - eagle.attackTime / 0.72;
        if (eagle.attackTime === 0) eagle.attackCooldown = 0.45;
      }

      if (attacking) {
        const strikeSpeed = attackProgress < 0.22 ? 1.2 : attackProgress < 0.68 ? 9.5 : 2.2;
        eagle.targetVelocity.copy(attackDirection).multiplyScalar(strikeSpeed);
      } else {
        eagle.targetVelocity.copy(moveDirection).multiplyScalar(moving ? 4.2 : 0);
      }
      eagle.velocity.lerp(eagle.targetVelocity, 1 - Math.exp(-(attacking ? 13 : 7) * deltaTime));
      eagleRoot.position.addScaledVector(eagle.velocity, deltaTime);
      const boundary = ARENA_SIZE * 0.47;
      eagleRoot.position.x = THREE.MathUtils.clamp(eagleRoot.position.x, -boundary, boundary);
      eagleRoot.position.z = THREE.MathUtils.clamp(eagleRoot.position.z, -boundary, boundary);
      eagleRoot.position.y = FLIGHT_HEIGHT + Math.sin(elapsed * 2.6) * (attacking ? 0.08 : 0.16);

      targetQuaternion.setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        Math.atan2(eagle.facing.x, eagle.facing.z) + Math.PI,
      );
      eagleRoot.quaternion.slerp(targetQuaternion, 1 - Math.exp(-9 * deltaTime));

      const targetWingSpeed = attacking ? 9 : moving ? 5.6 : 3.4;
      const targetWingAmount = attacking ? 1.03 : moving ? 0.78 : 0.56;
      eagle.wingSpeed = THREE.MathUtils.lerp(
        eagle.wingSpeed,
        targetWingSpeed,
        1 - Math.exp(-4.5 * deltaTime),
      );
      eagle.wingAmount = THREE.MathUtils.lerp(
        eagle.wingAmount,
        targetWingAmount,
        1 - Math.exp(-4 * deltaTime),
      );
      eagle.wingPhase += eagle.wingSpeed * deltaTime;

      const rootWave =
        Math.sin(eagle.wingPhase) + Math.sin(eagle.wingPhase * 2 - 0.5) * 0.14;
      fallbackWings.rotation.z = rootWave * eagle.wingAmount;

      if (eagle.wingBones?.length) {
        for (const bones of eagle.wingBones) {
          const phase = eagle.wingPhase - bones.lag;
          const rawFlap = Math.sin(phase) + Math.sin(phase * 2 - 0.5) * 0.12;
          // Downstroke dùng toàn bộ biên độ; upstroke nhẹ hơn để cánh thật sự
          // quạt xuống dưới thay vì chỉ rung quanh tư thế dựng cao của asset.
          const flapWave = rawFlap >= 0 ? rawFlap : rawFlap * 0.42;
          const flap = THREE.MathUtils.clamp(
            bones.downBias + flapWave * eagle.wingAmount * bones.amount,
            -0.34,
            1.18,
          );
          const twist =
            Math.sin(phase - Math.PI * 0.4) *
            eagle.wingAmount *
            bones.twist;
          bones.leftFlap.setFromAxisAngle(wingFlapAxis, flap);
          bones.rightFlap.setFromAxisAngle(wingFlapAxis, -flap);
          bones.leftTwist.setFromAxisAngle(wingTwistAxis, twist);
          bones.rightTwist.setFromAxisAngle(wingTwistAxis, twist);
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

      if (eagle.visualRig) {
        const strike = attacking ? Math.sin(attackProgress * Math.PI) : 0;
        eagle.visualRig.rotation.x =
          FLIGHT_PITCH + Math.sin(elapsed * 2.1) * 0.018 + strike * 0.1;
        eagle.visualRig.position.z = -strike * 0.48;
        eagle.visualRig.rotation.z = THREE.MathUtils.lerp(
          eagle.visualRig.rotation.z,
          moving ? -rightInput * 0.1 : 0,
          1 - Math.exp(-5 * deltaTime),
        );
      }

      attackWave.material.opacity = attacking ? Math.sin(attackProgress * Math.PI) * 0.72 : 0;
      attackWave.scale.setScalar(1 + attackProgress * 3.2);

      targetRing.rotation.y += deltaTime * 1.3;
      targetCore.rotation.y += deltaTime * 1.9;
      targetCore.rotation.x += deltaTime * 0.8;

      const nextState = attacking
        ? attackProgress < 0.22
          ? "attack wind-up"
          : attackProgress < 0.68
            ? "attack strike"
            : "recover"
        : moving
          ? "fly"
          : "glide";
      if (nextState !== eagle.state) {
        eagle.state = nextState;
        stateField.textContent = nextState;
      }
      speedField.textContent = `${eagle.velocity.length().toFixed(1)} m/s`;
      attackField.textContent = attacking
        ? "Attacking"
        : eagle.attackCooldown > 0
          ? "Recovering"
          : "Ready";

      const horizontalDistance = Math.cos(cameraPitch) * cameraDistance;
      desiredCamera.set(
        eagleRoot.position.x + Math.sin(cameraYaw) * horizontalDistance,
        eagleRoot.position.y + Math.sin(cameraPitch) * cameraDistance,
        eagleRoot.position.z - Math.cos(cameraYaw) * horizontalDistance,
      );
      camera.position.lerp(desiredCamera, 1 - Math.exp(-5.5 * deltaTime));
      cameraLookAt.set(eagleRoot.position.x, eagleRoot.position.y + 0.1, eagleRoot.position.z);
      camera.lookAt(cameraLookAt);
    }

    return {
      update,
      dispose() {
        disposed = true;
        canvas.removeEventListener("click", onCanvasClick);
        canvas.removeEventListener("mousedown", onMouseDown);
        window.removeEventListener("mouseup", onMouseUp);
        window.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("pointerlockchange", onPointerLockChange);
        if (document.pointerLockElement === canvas) document.exitPointerLock?.();
        hud.remove();
        scene.fog = previousFog;
        camera.far = previousFar;
        camera.updateProjectionMatrix();
        renderer.shadowMap.enabled = previousShadowEnabled;
        renderer.shadowMap.type = previousShadowType;
        renderer.toneMapping = previousToneMapping;
        renderer.toneMappingExposure = previousExposure;
      },
    };
  },
};
