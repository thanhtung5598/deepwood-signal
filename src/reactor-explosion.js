import * as THREE from "three";

export function createReactorExplosion() {
  const group = new THREE.Group();
  group.visible = false;
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 16, 12),
    new THREE.MeshBasicMaterial({ color: "#ffb44b", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  const shock = new THREE.Mesh(
    new THREE.RingGeometry(0.75, 0.85, 40),
    new THREE.MeshBasicMaterial({ color: "#ff8d45", side: THREE.DoubleSide, transparent: true, depthWrite: false }),
  );
  shock.rotation.x = -Math.PI / 2;
  shock.position.y = -0.95;
  const light = new THREE.PointLight("#ff9945", 0, 9);
  const geometry = new THREE.BoxGeometry(0.09, 0.15, 0.07);
  const material = new THREE.MeshStandardMaterial({ color: "#33433c", metalness: 0.7, roughness: 0.6 });
  const debris = Array.from({ length: 12 }, (_, index) => {
    const piece = new THREE.Mesh(geometry, material);
    const angle = index * 2.39996;
    const speed = 1.3 + (index % 4) * 0.45;
    piece.userData.velocity = new THREE.Vector3(Math.cos(angle) * speed, 2.4 + (index % 3) * 0.5, Math.sin(angle) * speed);
    group.add(piece);
    return piece;
  });
  const positions = new Float32Array(64 * 3);
  const velocities = new Float32Array(positions.length);
  for (let index = 0; index < 64; index++) {
    const angle = index * 2.39996;
    const radius = 2.2 + (index % 7) * 0.27;
    velocities[index * 3] = Math.cos(angle) * radius;
    velocities[index * 3 + 1] = 1.4 + (index % 9) * 0.32;
    velocities[index * 3 + 2] = Math.sin(angle) * radius;
  }
  const particles = new THREE.Points(
    new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(positions, 3)),
    new THREE.PointsMaterial({ color: "#ffd28b", size: 0.075, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  group.add(flash, shock, particles, light);

  return {
    group,
    start(position) {
      group.position.copy(position);
      group.position.y += 1.05;
      group.visible = true;
      this.update(0);
    },
    reset() { group.visible = false; },
    update(time) {
      const fade = Math.max(0, 1 - time / 1.4);
      flash.scale.setScalar(1 + time * 7);
      flash.material.opacity = fade ** 3;
      shock.scale.setScalar(0.4 + time * 4.4);
      shock.material.opacity = fade * 0.8;
      light.intensity = fade ** 2 * 14;
      particles.material.opacity = fade;
      for (let index = 0; index < 64; index++) {
        positions[index * 3] = velocities[index * 3] * time;
        positions[index * 3 + 1] = velocities[index * 3 + 1] * time - 2.5 * time ** 2;
        positions[index * 3 + 2] = velocities[index * 3 + 2] * time;
      }
      particles.geometry.attributes.position.needsUpdate = true;
      particles.geometry.computeBoundingSphere();
      debris.forEach((piece, index) => {
        piece.position.copy(piece.userData.velocity).multiplyScalar(time);
        piece.position.y = Math.max(-0.95, piece.position.y - 3.5 * time ** 2);
        piece.rotation.set(time * (index + 1), time * 3, time * 2);
      });
      if (time >= 1.4) group.visible = false;
    },
  };
}
