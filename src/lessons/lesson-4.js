import * as THREE from "three";
import { Capsule } from "three/addons/math/Capsule.js";

const GRAVITY = 18;
const GROUND_Y = 0;
const COLORS = {
  skyLight: "#dbeafe",
  groundLight: "#172033",
  sunlight: "#ffffff",
  ground: "#263a37",
  gridCenter: "#4b7b72",
  grid: "#304943",
  rock: "#697386",
  rockCollider: "#fb7185",
  player: "#22d3ee",
  playerCollider: "#fde047",
};

export default {
  title: "Physics bằng collider",
  description:
    "WASD để di chuyển, Space để nhảy. Màu wireframe biểu diễn capsule của player và sphere của rock.",
  usesKeyboard: true,

  setup({ scene, camera, pressedKeys }) {
    camera.position.set(7, 6, 9);
    camera.lookAt(0, 0.8, 0);

    const ambientLight = new THREE.HemisphereLight(
      COLORS.skyLight,
      COLORS.groundLight,
      2.2,
    );
    const sunlight = new THREE.DirectionalLight(COLORS.sunlight, 2.5);
    sunlight.position.set(4, 8, 5);
    scene.add(ambientLight, sunlight);

    // GROUND: mesh để nhìn và mặt phẳng Y = 0 dùng làm collider.
    const groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 12),
      new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 1 }),
    );
    groundMesh.rotation.x = -Math.PI / 2;
    const groundGrid = new THREE.GridHelper(
      12,
      12,
      COLORS.gridCenter,
      COLORS.grid,
    );
    groundGrid.position.y = 0.002;
    scene.add(groundMesh, groundGrid);

    // ROCK: model trang trí nhỏ hơn collider hình cầu màu đỏ.
    const rockDefinitions = [
      { center: new THREE.Vector3(-2, 0.8, 0), radius: 0.8 },
      { center: new THREE.Vector3(1.4, 0.95, -1.2), radius: 0.95 },
      { center: new THREE.Vector3(2.2, 0.7, 2), radius: 0.7 },
    ];

    const rockColliders = rockDefinitions.map(({ center, radius }) => {
      const rockMesh = new THREE.Mesh(
        new THREE.DodecahedronGeometry(radius * 0.82, 1),
        new THREE.MeshStandardMaterial({ color: COLORS.rock, roughness: 0.95 }),
      );
      rockMesh.position.copy(center);
      rockMesh.rotation.set(0.15, center.x, -0.08);

      const colliderHelper = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 16, 12),
        new THREE.MeshBasicMaterial({
          color: COLORS.rockCollider,
          wireframe: true,
          transparent: true,
          opacity: 0.65,
        }),
      );
      colliderHelper.position.copy(center);
      scene.add(rockMesh, colliderHelper);

      return new THREE.Sphere(center.clone(), radius);
    });

    // PLAYER: state vật lý tách khỏi phần hình ảnh.
    const player = {
      collider: new Capsule(
        new THREE.Vector3(0, 0.45, 3.5),
        new THREE.Vector3(0, 1.35, 3.5),
        0.45,
      ),
      velocity: new THREE.Vector3(),
      direction: new THREE.Vector3(),
      speed: 4,
      grounded: true,
      jumpHeld: false,
    };

    const playerVisual = new THREE.Group();
    const bodyMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.3, 0.85, 6, 12),
      new THREE.MeshStandardMaterial({ color: COLORS.player, roughness: 0.7 }),
    );
    const capsuleHelper = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.45, 0.9, 6, 12),
      new THREE.MeshBasicMaterial({
        color: COLORS.playerCollider,
        wireframe: true,
        transparent: true,
        opacity: 0.85,
      }),
    );
    playerVisual.add(bodyMesh, capsuleHelper);
    scene.add(playerVisual);

    const displacement = new THREE.Vector3();
    const capsuleAxis = new THREE.Vector3();
    const toSphere = new THREE.Vector3();
    const closestPoint = new THREE.Vector3();
    const collisionNormal = new THREE.Vector3();
    const correction = new THREE.Vector3();
    const playerCenter = new THREE.Vector3();

    function resolveGroundCollision() {
      const bottom = player.collider.start.y - player.collider.radius;

      if (bottom < GROUND_Y) {
        correction.set(0, GROUND_Y - bottom, 0);
        player.collider.translate(correction);
        player.velocity.y = 0;
        player.grounded = true;
      } else {
        player.grounded = false;
      }
    }

    function resolveRockCollision(rockCollider) {
      capsuleAxis.subVectors(player.collider.end, player.collider.start);
      toSphere.subVectors(rockCollider.center, player.collider.start);

      const axisLengthSquared = capsuleAxis.lengthSq();
      const amount = THREE.MathUtils.clamp(
        toSphere.dot(capsuleAxis) / axisLengthSquared,
        0,
        1,
      );

      closestPoint
        .copy(player.collider.start)
        .addScaledVector(capsuleAxis, amount);
      collisionNormal.subVectors(closestPoint, rockCollider.center);

      const minimumDistance = player.collider.radius + rockCollider.radius;
      const distance = collisionNormal.length();
      if (distance >= minimumDistance) return;

      if (distance < 0.0001) collisionNormal.set(1, 0, 0);
      else collisionNormal.multiplyScalar(1 / distance);

      correction
        .copy(collisionNormal)
        .multiplyScalar(minimumDistance - distance);
      player.collider.translate(correction);

      // Loại bỏ phần velocity đang đâm vào rock, giữ phần trượt ngang.
      const velocityIntoRock = player.velocity.dot(collisionNormal);
      if (velocityIntoRock < 0) {
        player.velocity.addScaledVector(
          collisionNormal,
          -velocityIntoRock,
        );
      }
    }

    function keepPlayerOnGroundArea() {
      player.collider.getCenter(playerCenter);
      correction.set(
        THREE.MathUtils.clamp(playerCenter.x, -5.5, 5.5) - playerCenter.x,
        0,
        THREE.MathUtils.clamp(playerCenter.z, -5.5, 5.5) - playerCenter.z,
      );
      player.collider.translate(correction);
    }

    function syncVisualWithCollider() {
      player.collider.getCenter(playerCenter);
      playerVisual.position.copy(playerCenter);
    }

    syncVisualWithCollider();

    return (deltaTime) => {
      player.direction.set(0, 0, 0);

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
      if (player.direction.lengthSq() > 0) player.direction.normalize();

      player.velocity.x = player.direction.x * player.speed;
      player.velocity.z = player.direction.z * player.speed;

      const jumping = pressedKeys.has("Space");
      if (jumping && !player.jumpHeld && player.grounded) {
        player.velocity.y = 7;
        player.grounded = false;
      }
      player.jumpHeld = jumping;

      player.velocity.y -= GRAVITY * deltaTime;
      displacement.copy(player.velocity).multiplyScalar(deltaTime);
      player.collider.translate(displacement);

      resolveGroundCollision();
      for (const rockCollider of rockColliders) {
        resolveRockCollision(rockCollider);
      }
      resolveGroundCollision();
      keepPlayerOnGroundArea();
      syncVisualWithCollider();
    };
  },
};
