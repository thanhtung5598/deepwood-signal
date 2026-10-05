import * as THREE from "three";

export default {
  title: "Biến cube thành player",
  description:
    "Dùng WASD hoặc phím mũi tên. Player có mesh, tốc độ, hướng và logic cập nhật.",
  usesKeyboard: true,

  setup({ scene, camera, pressedKeys }) {
    camera.position.set(0, 7, 7);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.GridHelper(10, 10, "#64748b", "#334155"));

    const player = {
      mesh: new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshNormalMaterial(),
      ),
      speed: 3,
      direction: new THREE.Vector3(),
    };

    player.mesh.position.y = 0.5;
    scene.add(player.mesh);

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

      if (player.direction.lengthSq() > 0) {
        player.direction.normalize();
      }

      player.mesh.position.addScaledVector(
        player.direction,
        player.speed * deltaTime,
      );
      player.mesh.position.x = THREE.MathUtils.clamp(
        player.mesh.position.x,
        -4.5,
        4.5,
      );
      player.mesh.position.z = THREE.MathUtils.clamp(
        player.mesh.position.z,
        -4.5,
        4.5,
      );
    };
  },
};
