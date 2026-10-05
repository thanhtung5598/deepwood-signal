import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createInPlaceClip } from "../animation-utils.js";

export function createHumanoidLesson({
  title,
  description,
  modelUrl,
  modelName,
  targetHeight,
  groundColor,
  gridColor,
  accentColor,
  supportsJump = false,
  animationNames = {},
  animationTimeScales = {},
  rootMotionBone = null,
  lockRootHeightAnimations = [],
  walkSpeed = 3.1,
  runSpeed = 5.4,
}) {
  return {
    title,
    description,
    usesKeyboard: true,

    setup({ scene, camera, pressedKeys }) {
      camera.position.set(3.8, 3.1, 5.5);

      const hemisphereLight = new THREE.HemisphereLight(
        "#e0f2fe",
        "#111827",
        2.5,
      );
      const keyLight = new THREE.DirectionalLight("#ffffff", 3.2);
      keyLight.position.set(5, 9, 6);
      const rimLight = new THREE.DirectionalLight(accentColor, 2.2);
      rimLight.position.set(-5, 4, -4);
      scene.add(hemisphereLight, keyLight, rimLight);

      const ground = new THREE.Mesh(
        new THREE.CircleGeometry(13, 80),
        new THREE.MeshStandardMaterial({ color: groundColor, roughness: 0.96 }),
      );
      ground.rotation.x = -Math.PI / 2;
      const grid = new THREE.GridHelper(24, 24, gridColor, "#29374c");
      grid.position.y = 0.006;
      scene.add(ground, grid);

      const playerRoot = new THREE.Group();
      playerRoot.position.set(0, 0, 2.5);
      scene.add(playerRoot);

      const marker = new THREE.Mesh(
        new THREE.RingGeometry(0.58, 0.7, 48),
        new THREE.MeshBasicMaterial({
          color: accentColor,
          transparent: true,
          opacity: 0.75,
          side: THREE.DoubleSide,
        }),
      );
      marker.rotation.x = -Math.PI / 2;
      marker.position.y = 0.018;
      playerRoot.add(marker);

      const hud = document.createElement("section");
      hud.className = "character-hud";
      hud.innerHTML = `
        <div class="character-hud__heading">
          <strong>${modelName}</strong>
          <span data-field="load">Đang tải…</span>
        </div>
        <dl>
          <dt>Skeleton</dt><dd data-field="bones">—</dd>
          <dt>Animation</dt><dd data-field="clips">—</dd>
          <dt>Đang phát</dt><dd data-field="state">—</dd>
        </dl>
        <div class="control-keys" aria-label="Điều khiển nhân vật">
          <span><kbd>WASD</kbd> di chuyển</span>
          <span><kbd>Shift</kbd> chạy</span>
          ${supportsJump
            ? '<span><kbd>Space</kbd> nhảy</span><span><kbd>E</kbd> vẫy tay</span>'
            : '<span><kbd>Space</kbd> vẫy tay</span>'}
        </div>
      `;
      document.querySelector(".stage").append(hud);

      const loadField = hud.querySelector("[data-field='load']");
      const clipsField = hud.querySelector("[data-field='clips']");
      const bonesField = hud.querySelector("[data-field='bones']");
      const stateField = hud.querySelector("[data-field='state']");
      const player = {
        model: null,
        mixer: null,
        actions: new Map(),
        activeAction: null,
        activeState: "",
        velocity: new THREE.Vector3(),
        verticalVelocity: 0,
        grounded: true,
      };
      const direction = new THREE.Vector3();
      const cameraTarget = new THREE.Vector3();
      const desiredCameraPosition = new THREE.Vector3();
      const targetFacing = new THREE.Quaternion();
      const loader = new GLTFLoader();
      const previewAnimation = import.meta.env.DEV
        ? new URLSearchParams(window.location.search).get("preview")
        : null;
      let disposed = false;
      let jumpWasPressed = false;

      function playAnimation(name) {
        if (!player.mixer || player.activeState === name) return;
        const nextAction = player.actions.get(name);
        if (!nextAction) return;

        nextAction.reset();
        nextAction.enabled = true;
        nextAction.setEffectiveTimeScale(
          animationTimeScales[name] ??
            (name === "run" ? 1.1 : name === "jump" ? 1.08 : 1),
        );
        nextAction.setEffectiveWeight(1);
        nextAction.setLoop(
          name === "jump" ? THREE.LoopOnce : THREE.LoopRepeat,
          name === "jump" ? 1 : Infinity,
        );
        nextAction.clampWhenFinished = name === "jump";
        nextAction.fadeIn(0.2).play();
        player.activeAction?.fadeOut(0.2);
        player.activeAction = nextAction;
        player.activeState = name;
        stateField.textContent = name;
      }

      loader.load(
        modelUrl,
        (gltf) => {
          if (disposed) {
            disposeModel(gltf.scene);
            return;
          }

          player.model = gltf.scene;
          player.model.name = modelName;
          player.model.updateMatrixWorld(true);

          const sourceBounds = new THREE.Box3().setFromObject(player.model);
          const sourceSize = sourceBounds.getSize(new THREE.Vector3());
          const scale = sourceSize.y > 0 ? targetHeight / sourceSize.y : 1;
          player.model.scale.setScalar(scale);
          player.model.updateMatrixWorld(true);

          const fittedBounds = new THREE.Box3().setFromObject(player.model);
          const center = fittedBounds.getCenter(new THREE.Vector3());
          player.model.position.set(-center.x, -fittedBounds.min.y, -center.z);
          player.model.updateMatrixWorld(true);
          playerRoot.add(player.model);

          const rootMotionPosition = rootMotionBone
            ? player.model.getObjectByName(rootMotionBone)?.position
            : null;
          const stateByClipName = new Map(
            Object.entries(animationNames).map(([state, clipName]) => [
              clipName,
              state,
            ]),
          );

          player.mixer = new THREE.AnimationMixer(player.model);
          for (const clip of gltf.animations) {
            const state = stateByClipName.get(clip.name) ?? clip.name;
            const playableClip = rootMotionPosition
              ? createInPlaceClip(
                  clip,
                  rootMotionBone,
                  rootMotionPosition,
                  lockRootHeightAnimations.includes(state),
                )
              : clip;
            player.actions.set(
              clip.name,
              player.mixer.clipAction(playableClip),
            );
          }
          for (const [state, clipName] of Object.entries(animationNames)) {
            const action = player.actions.get(clipName);
            if (action) player.actions.set(state, action);
          }

          const bones = new Set();
          player.model.traverse((object) => {
            for (const bone of object.skeleton?.bones ?? []) bones.add(bone);
          });
          bonesField.textContent = `${bones.size} bones`;

          clipsField.textContent = `${gltf.animations.length} clips`;
          loadField.textContent = "Đã rig · sẵn sàng";
          playAnimation("idle");
        },
        undefined,
        (error) => {
          console.error(`Không tải được ${modelUrl}`, error);
          loadField.textContent = "Lỗi tải model";
          loadField.classList.add("is-error");
        },
      );

      function update(deltaTime) {
        direction.set(0, 0, 0);
        if (pressedKeys.has("KeyW") || pressedKeys.has("ArrowUp")) {
          direction.z -= 1;
        }
        if (pressedKeys.has("KeyS") || pressedKeys.has("ArrowDown")) {
          direction.z += 1;
        }
        if (pressedKeys.has("KeyA") || pressedKeys.has("ArrowLeft")) {
          direction.x -= 1;
        }
        if (pressedKeys.has("KeyD") || pressedKeys.has("ArrowRight")) {
          direction.x += 1;
        }

        const moving = direction.lengthSq() > 0;
        const running =
          pressedKeys.has("ShiftLeft") || pressedKeys.has("ShiftRight");
        const jumpPressed = supportsJump && pressedKeys.has("Space");
        const waving =
          pressedKeys.has(supportsJump ? "KeyE" : "Space") &&
          !moving &&
          player.grounded;

        if (jumpPressed && !jumpWasPressed && player.grounded) {
          player.verticalVelocity = 5.6;
          player.grounded = false;
        }
        jumpWasPressed = jumpPressed;

        if (!player.grounded) {
          player.verticalVelocity -= 15.5 * deltaTime;
          playerRoot.position.y += player.verticalVelocity * deltaTime;
          if (playerRoot.position.y <= 0) {
            playerRoot.position.y = 0;
            player.verticalVelocity = 0;
            player.grounded = true;
          }
        }

        if (moving) {
          direction.normalize();
          const speed = running ? runSpeed : walkSpeed;
          player.velocity.copy(direction).multiplyScalar(speed);
          playerRoot.position.addScaledVector(player.velocity, deltaTime);
          playerRoot.position.x = THREE.MathUtils.clamp(
            playerRoot.position.x,
            -10.5,
            10.5,
          );
          playerRoot.position.z = THREE.MathUtils.clamp(
            playerRoot.position.z,
            -10.5,
            10.5,
          );

          targetFacing.setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            Math.atan2(direction.x, direction.z),
          );
          playerRoot.quaternion.slerp(
            targetFacing,
            1 - Math.exp(-12 * deltaTime),
          );
        } else {
          player.velocity.set(0, 0, 0);
        }

        playAnimation(
          previewAnimation ||
            (!player.grounded
              ? "jump"
              : waving
                ? "wave"
                : moving
                  ? running
                    ? "run"
                    : "walk"
                  : "idle"),
        );
        player.mixer?.update(deltaTime);

        cameraTarget.set(
          playerRoot.position.x,
          targetHeight * 0.48,
          playerRoot.position.z,
        );
        desiredCameraPosition.set(
          playerRoot.position.x + 3.8,
          targetHeight * 1.45,
          playerRoot.position.z + 5.5,
        );
        camera.position.lerp(
          desiredCameraPosition,
          1 - Math.exp(-4.5 * deltaTime),
        );
        camera.lookAt(cameraTarget);
      }

      return {
        update,
        dispose() {
          disposed = true;
          player.mixer?.stopAllAction();
          if (player.mixer && player.model) {
            player.mixer.uncacheRoot(player.model);
          }
          hud.remove();
        },
      };
    },
  };
}

function disposeModel(root) {
  root.traverse((object) => {
    object.geometry?.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) material?.dispose();
  });
}
