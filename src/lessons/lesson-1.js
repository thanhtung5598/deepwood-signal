import * as THREE from "three";

export default {
  title: "Scene → Camera → Renderer → Game loop",
  description:
    "Cube xoay vì game loop cập nhật rotation rồi yêu cầu renderer vẽ frame mới.",

  setup({ scene, camera }) {
    camera.position.set(0, 0, 3);
    camera.lookAt(0, 0, 0);

    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshNormalMaterial(),
    );
    scene.add(cube);

    // main.js gọi hàm này một lần trong mỗi frame.
    return (deltaTime) => {
      cube.rotation.x += deltaTime * 0.7;
      cube.rotation.y += deltaTime;
    };
  },
};
