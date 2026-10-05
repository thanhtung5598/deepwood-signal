import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Capsule } from "three/addons/math/Capsule.js";

export default {
  title: "Animal GLB và animation",
  description:
    "WASD: hop · Shift: run · E: eat. Capsule collider ẩn vẫn va chạm với 3 rock.",
  usesKeyboard: true,

  setup({ scene, camera, pressedKeys }) {
    camera.position.set(0, 6, 8);
    camera.lookAt(0, 0.8, 0);

    const ambientLight = new THREE.HemisphereLight("#dbeafe", "#172033", 2.2);
    const sunlight = new THREE.DirectionalLight("#ffffff", 2.5);
    sunlight.position.set(4, 8, 5);
    scene.add(ambientLight, sunlight);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 12),
      new THREE.MeshStandardMaterial({ color: "#263a37", roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;

    const grid = new THREE.GridHelper(12, 12, "#4b7b72", "#304943");
    grid.position.y = 0.002;
    scene.add(ground, grid);

    // Mỗi rock có một mesh để nhìn và một Sphere làm collider thật.
    const rockColliders = [
      { center: new THREE.Vector3(0, 0.8, 1.2), radius: 0.8 },
      { center: new THREE.Vector3(-2, 0.7, -0.5), radius: 0.7 },
      { center: new THREE.Vector3(2, 0.95, -1.5), radius: 0.95 },
    ].map(({ center, radius }) => {
      const rockMesh = new THREE.Mesh(
        new THREE.DodecahedronGeometry(radius * 0.82, 1),
        new THREE.MeshStandardMaterial({ color: "#0755e6", roughness: 0.95 }),
      );
      rockMesh.position.copy(center);
      rockMesh.rotation.set(0.12, center.x, -0.08);

      const rockColliderHelper = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 16, 12),
        new THREE.MeshBasicMaterial({
          color: "#fb7185",
          wireframe: true,
          transparent: true,
          opacity: 0.65,
        }),
      );
      rockColliderHelper.position.copy(center);
      rockColliderHelper.visible = false;
      scene.add(rockMesh, rockColliderHelper);

      return new THREE.Sphere(center.clone(), radius);
    });

    // playerRoot là transform chung. Model GLB và collider cùng đi theo nó.
    const playerRoot = new THREE.Group();
    scene.add(playerRoot);

    const capsuleRadius = 0.6;
    const capsuleStartY = 0.6;
    const capsuleEndY = 1.05;
    const capsuleCenterY = (capsuleStartY + capsuleEndY) * 0.5;
    const capsuleHelper = new THREE.Mesh(
      new THREE.CapsuleGeometry(
        capsuleRadius,
        capsuleEndY - capsuleStartY,
        6,
        12,
      ),
      new THREE.MeshBasicMaterial({
        color: "#fde047",
        wireframe: true,
        transparent: true,
        opacity: 0.7,
      }),
    );
    capsuleHelper.position.y = capsuleCenterY;
    capsuleHelper.visible = false;
    playerRoot.add(capsuleHelper);

    const player = {
      root: playerRoot,
      collider: new Capsule(
        new THREE.Vector3(0, capsuleStartY, 3.5),
        new THREE.Vector3(0, capsuleEndY, 3.5),
        capsuleRadius,
      ),
      direction: new THREE.Vector3(),
      targetVelocity: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      mixer: null,
      model: null,
      actions: new Map(),
      activeAction: null,
      activeAnimation: "",
    };

    const displacement = new THREE.Vector3();
    const correction = new THREE.Vector3();
    const colliderCenter = new THREE.Vector3();
    const capsuleAxis = new THREE.Vector3();
    const toRock = new THREE.Vector3();
    const closestPoint = new THREE.Vector3();
    const collisionNormal = new THREE.Vector3();
    const walkSpeed = 2.35;
    const runSpeed = 4.8;

    function syncVisualWithCollider() {
      player.collider.getCenter(colliderCenter);
      player.root.position.set(
        colliderCenter.x,
        colliderCenter.y - capsuleCenterY,
        colliderCenter.z,
      );
    }

    function playAnimation(name) {
      if (!player.mixer || player.activeAnimation === name) return;

      const nextAction = player.actions.get(name);
      if (!nextAction) return;

      const fadeDuration =
        player.activeAnimation === "idle" || name === "idle" ? 0.28 : 0.2;
      nextAction.reset().fadeIn(fadeDuration).play();
      player.activeAction?.fadeOut(fadeDuration);
      player.activeAction = nextAction;
      player.activeAnimation = name;
    }

    function syncAnimationSpeed(deltaTime, movementSpeed) {
      if (!player.activeAction) return;

      let targetTimeScale = 1;
      if (player.activeAnimation === "hop") {
        // Một vòng hop tương ứng khoảng 1.45 world units.
        targetTimeScale = THREE.MathUtils.clamp(
          (movementSpeed * player.activeAction.getClip().duration) / 1.45,
          0.72,
          1.8,
        );
      } else if (player.activeAnimation === "run") {
        // Run có stride dài hơn và cadence nhanh hơn hop.
        targetTimeScale = THREE.MathUtils.clamp(
          (movementSpeed * player.activeAction.getClip().duration) / 1.7,
          1,
          1.85,
        );
      }

      player.activeAction.timeScale = THREE.MathUtils.damp(
        player.activeAction.timeScale,
        targetTimeScale,
        9,
        deltaTime,
      );
    }

    function gaitVelocityFactor() {
      if (
        !player.activeAction ||
        (player.activeAnimation !== "hop" && player.activeAnimation !== "run")
      ) {
        return 1;
      }

      const duration = player.activeAction.getClip().duration;
      const phase = (player.activeAction.time % duration) / duration;
      const pulse = Math.sin((phase - 0.18) * Math.PI * 2);
      return player.activeAnimation === "run"
        ? 1 + pulse * 0.1
        : 1 + pulse * 0.18;
    }

    function resolveRockCollision(rockCollider) {
      // Tìm điểm trên đoạn giữa capsule gần tâm rock nhất.
      capsuleAxis.subVectors(player.collider.end, player.collider.start);
      toRock.subVectors(rockCollider.center, player.collider.start);
      const amount = THREE.MathUtils.clamp(
        toRock.dot(capsuleAxis) / capsuleAxis.lengthSq(),
        0,
        1,
      );
      closestPoint
        .copy(player.collider.start)
        .addScaledVector(capsuleAxis, amount);

      // Nếu khoảng cách nhỏ hơn tổng bán kính, hai collider đang giao nhau.
      collisionNormal.subVectors(closestPoint, rockCollider.center);
      const minimumDistance = player.collider.radius + rockCollider.radius;
      const distance = collisionNormal.length();
      if (distance >= minimumDistance) return;

      if (distance < 0.0001) collisionNormal.set(1, 0, 0);
      else collisionNormal.multiplyScalar(1 / distance);

      // Đẩy capsule ra đúng phần chiều sâu đang bị xuyên vào rock.
      correction
        .copy(collisionNormal)
        .multiplyScalar(minimumDistance - distance);
      player.collider.translate(correction);
    }

    syncVisualWithCollider();
    let disposed = false;

    // GLTFLoader trả về model và danh sách AnimationClip nằm trong rabbit.glb.
    const loader = new GLTFLoader();
    loader.load(
      "/models/rabbit-animated.glb",
      (gltf) => {
        if (disposed) {
          disposeModel(gltf.scene);
          return;
        }

        player.model = gltf.scene;
        player.model.name = "RabbitVisual";

        // Chuẩn hóa GLB theo chiều cao gameplay và đặt chân xuống mặt đất.
        player.model.updateMatrixWorld(true);
        const sourceBounds = new THREE.Box3().setFromObject(player.model);
        const sourceSize = sourceBounds.getSize(new THREE.Vector3());
        const modelScale = sourceSize.y > 0 ? 1.6 / sourceSize.y : 1;
        player.model.scale.setScalar(modelScale);
        player.model.updateMatrixWorld(true);

        const fittedBounds = new THREE.Box3().setFromObject(player.model);
        const fittedCenter = fittedBounds.getCenter(new THREE.Vector3());
        player.model.position.set(
          -fittedCenter.x,
          -fittedBounds.min.y,
          -fittedCenter.z,
        );
        player.model.updateMatrixWorld(true);
        player.root.add(player.model);

        player.mixer = new THREE.AnimationMixer(player.model);
        for (const clip of gltf.animations) {
          player.actions.set(clip.name, player.mixer.clipAction(clip));
        }
        playAnimation("idle");
      },
      undefined,
      (error) => {
        console.error("Không tải được /models/rabbit-animated.glb", error);
      },
    );

    function update(deltaTime) {
      const eating = pressedKeys.has("KeyE");
      const running =
        pressedKeys.has("ShiftLeft") || pressedKeys.has("ShiftRight");
      player.direction.set(0, 0, 0);

      // Khi ăn, player đứng tại chỗ để state eat không xung đột locomotion.
      if (!eating) {
        if (pressedKeys.has("KeyW") || pressedKeys.has("ArrowUp")) {
          player.direction.z -= 1;
        }
        if (pressedKeys.has("KeyS") || pressedKeys.has("ArrowDown")) {
          player.direction.z += 1;
        }
        if (pressedKeys.has("KeyA") || pressedKeys.has("ArrowLeft")) {
          player.direction.x -= 1;
        }
        if (pressedKeys.has("KeyD") || pressedKeys.has("ArrowRight")) {
          player.direction.x += 1;
        }
      }

      const hasMovementInput = player.direction.lengthSq() > 0;
      if (hasMovementInput) {
        player.direction.normalize();
        const targetAngle = Math.atan2(
          player.direction.x,
          player.direction.z,
        );
        const angleDifference = THREE.MathUtils.euclideanModulo(
          targetAngle - player.root.rotation.y + Math.PI,
          Math.PI * 2,
        ) - Math.PI;
        player.root.rotation.y +=
          angleDifference * (1 - Math.exp(-12 * deltaTime));
      }

      const targetSpeed = hasMovementInput ? (running ? runSpeed : walkSpeed) : 0;
      player.targetVelocity
        .copy(player.direction)
        .multiplyScalar(targetSpeed);

      // Acceleration/deceleration removes the instant start-stop that made the
      // rabbit look like it was sliding between poses.
      const velocityResponse = hasMovementInput ? 7.5 : 11;
      player.velocity.lerp(
        player.targetVelocity,
        1 - Math.exp(-velocityResponse * deltaTime),
      );
      if (!hasMovementInput && player.velocity.lengthSq() < 0.0004) {
        player.velocity.set(0, 0, 0);
      }

      const movementSpeed = player.velocity.length();
      const animationName = eating && movementSpeed < 0.12
        ? "eat"
        : movementSpeed > 0.08
          ? movementSpeed > (walkSpeed + runSpeed) * 0.58
            ? "run"
            : "hop"
          : "idle";
      playAnimation(animationName);
      syncAnimationSpeed(deltaTime, movementSpeed);

      displacement
        .copy(player.velocity)
        .multiplyScalar(deltaTime * gaitVelocityFactor());
      player.collider.translate(displacement);

      for (const rockCollider of rockColliders) {
        resolveRockCollision(rockCollider);
      }

      player.collider.getCenter(colliderCenter);
      correction.set(
        THREE.MathUtils.clamp(colliderCenter.x, -5.55, 5.55) - colliderCenter.x,
        0,
        THREE.MathUtils.clamp(colliderCenter.z, -5.55, 5.55) - colliderCenter.z,
      );
      player.collider.translate(correction);
      syncVisualWithCollider();

      player.mixer?.update(deltaTime);
    }

    return {
      update,
      dispose() {
        disposed = true;
        player.mixer?.stopAllAction();
        if (player.mixer && player.model) {
          player.mixer.uncacheRoot(player.model);
        }
      },
    };
  },
};

function disposeModel(root) {
  root.traverse((object) => {
    object.geometry?.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) material?.dispose();
  });
}
