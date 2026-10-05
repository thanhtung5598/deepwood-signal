import * as THREE from "three";

export default {
  title: "Position / Rotation / Scale",
  description:
    "Ba cube minh họa riêng vị trí, góc xoay và tỉ lệ trong hệ tọa độ X/Y/Z.",

  setup({ scene, camera }) {
    camera.position.set(5, 4, 7);
    camera.lookAt(0, 0.5, 0);

    scene.add(
      new THREE.GridHelper(10, 10, "#64748b", "#334155"),
      new THREE.AxesHelper(3),
    );

    const geometry = new THREE.BoxGeometry(1, 1, 1);

    const positionCube = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color: "#22d3ee" }),
    );
    positionCube.position.set(-2, 0.5, 0);

    const rotationCube = new THREE.Mesh(
      geometry,
      new THREE.MeshNormalMaterial(),
    );
    rotationCube.position.set(0, 0.5, 0);
    rotationCube.rotation.set(Math.PI / 6, Math.PI / 4, 0);

    const scaleCube = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color: "#f59e0b" }),
    );
    scaleCube.position.set(2, 0.9, 0);
    scaleCube.scale.set(0.6, 1.8, 0.6);

    scene.add(positionCube, rotationCube, scaleCube);

    // Bài này là scene tĩnh nên không cần cập nhật mỗi frame.
    return () => {};
  },
};
