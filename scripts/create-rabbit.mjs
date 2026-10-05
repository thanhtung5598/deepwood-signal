import { mkdir, writeFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

// GLTFExporter dùng FileReader của trình duyệt. Polyfill nhỏ này cho phép script
// xuất GLB bằng Node.js mà không cần thêm dependency.
global.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }

  readAsDataURL(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = `data:${blob.type};base64,${Buffer.from(result).toString("base64")}`;
      this.onloadend?.();
    });
  }
};

const rabbit = new THREE.Group();
rabbit.name = "Rabbit";

const fur = new THREE.MeshStandardMaterial({ color: "#cbd5e1", roughness: 0.95 });
const belly = new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.9 });
const dark = new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.75 });
const pink = new THREE.MeshStandardMaterial({ color: "#fda4af", roughness: 0.8 });

function mesh(name, geometry, material, position, scale = [1, 1, 1]) {
  const part = new THREE.Mesh(geometry, material);
  part.name = name;
  part.position.set(...position);
  part.scale.set(...scale);
  rabbit.add(part);
  return part;
}

mesh("Body", new THREE.SphereGeometry(0.65, 16, 12), fur, [0, 0.65, 0.1], [0.78, 0.72, 1.08]);
mesh("Belly", new THREE.SphereGeometry(0.48, 16, 12), belly, [0, 0.63, -0.42], [0.72, 0.82, 0.45]);
mesh("Head", new THREE.SphereGeometry(0.45, 16, 12), fur, [0, 1.08, -0.62], [0.95, 0.9, 0.95]);

const leftEar = mesh("EarLeft", new THREE.CapsuleGeometry(0.12, 0.48, 5, 10), fur, [-0.19, 1.62, -0.64], [1, 1, 0.75]);
leftEar.rotation.z = 0.12;
const rightEar = mesh("EarRight", new THREE.CapsuleGeometry(0.12, 0.48, 5, 10), fur, [0.19, 1.62, -0.64], [1, 1, 0.75]);
rightEar.rotation.z = -0.12;

mesh("FootLeft", new THREE.SphereGeometry(0.25, 12, 8), fur, [-0.3, 0.22, -0.38], [1, 0.65, 1.35]);
mesh("FootRight", new THREE.SphereGeometry(0.25, 12, 8), fur, [0.3, 0.22, -0.38], [1, 0.65, 1.35]);
mesh("Tail", new THREE.SphereGeometry(0.24, 12, 8), belly, [0, 0.7, 0.82]);

mesh("EyeLeft", new THREE.SphereGeometry(0.055, 10, 8), dark, [-0.16, 1.15, -1.01]);
mesh("EyeRight", new THREE.SphereGeometry(0.055, 10, 8), dark, [0.16, 1.15, -1.01]);
mesh("Nose", new THREE.SphereGeometry(0.065, 10, 8), pink, [0, 1.0, -1.06], [1.1, 0.8, 0.7]);

function positionTrack(nodeName, times, values) {
  return new THREE.VectorKeyframeTrack(`${nodeName}.position`, times, values);
}

function rotationTrack(nodeName, times, rotations) {
  const values = rotations.flatMap(([x, y, z]) => {
    const quaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(x, y, z),
    );
    return quaternion.toArray();
  });
  return new THREE.QuaternionKeyframeTrack(
    `${nodeName}.quaternion`,
    times,
    values,
  );
}

const idle = new THREE.AnimationClip("idle", 2, [
  positionTrack("Rabbit", [0, 1, 2], [
    0, 0, 0,
    0, 0.025, 0,
    0, 0, 0,
  ]),
  rotationTrack("EarLeft", [0, 1, 2], [
    [0, 0, 0.12],
    [0, 0, 0.18],
    [0, 0, 0.12],
  ]),
  rotationTrack("EarRight", [0, 1, 2], [
    [0, 0, -0.12],
    [0, 0, -0.18],
    [0, 0, -0.12],
  ]),
]);

const walkTimes = [0, 0.2, 0.4, 0.6, 0.8];
const walk = new THREE.AnimationClip("walk", 0.8, [
  positionTrack("Rabbit", walkTimes, [
    0, 0, 0,
    0, 0.055, 0,
    0, 0, 0,
    0, 0.055, 0,
    0, 0, 0,
  ]),
  rotationTrack("Body", walkTimes, [
    [0, 0, -0.05],
    [0, 0, 0],
    [0, 0, 0.05],
    [0, 0, 0],
    [0, 0, -0.05],
  ]),
  rotationTrack("FootLeft", walkTimes, [
    [0.3, 0, 0],
    [0, 0, 0],
    [-0.3, 0, 0],
    [0, 0, 0],
    [0.3, 0, 0],
  ]),
  rotationTrack("FootRight", walkTimes, [
    [-0.3, 0, 0],
    [0, 0, 0],
    [0.3, 0, 0],
    [0, 0, 0],
    [-0.3, 0, 0],
  ]),
]);

const runTimes = [0, 0.125, 0.25, 0.375, 0.5];
const run = new THREE.AnimationClip("run", 0.5, [
  positionTrack("Rabbit", runTimes, [
    0, 0, 0,
    0, 0.1, 0,
    0, 0, 0,
    0, 0.1, 0,
    0, 0, 0,
  ]),
  rotationTrack("Body", runTimes, [
    [0.08, 0, -0.1],
    [0, 0, 0],
    [0.08, 0, 0.1],
    [0, 0, 0],
    [0.08, 0, -0.1],
  ]),
  rotationTrack("FootLeft", runTimes, [
    [0.55, 0, 0],
    [0, 0, 0],
    [-0.55, 0, 0],
    [0, 0, 0],
    [0.55, 0, 0],
  ]),
  rotationTrack("FootRight", runTimes, [
    [-0.55, 0, 0],
    [0, 0, 0],
    [0.55, 0, 0],
    [0, 0, 0],
    [-0.55, 0, 0],
  ]),
]);

const eatTimes = [0, 0.3, 0.6, 0.9, 1.2];
const eat = new THREE.AnimationClip("eat", 1.2, [
  positionTrack("Head", eatTimes, [
    0, 1.08, -0.62,
    0, 0.84, -0.78,
    0, 0.9, -0.8,
    0, 0.84, -0.78,
    0, 1.08, -0.62,
  ]),
  rotationTrack("Head", eatTimes, [
    [0, 0, 0],
    [0.55, 0, 0],
    [0.4, 0, 0],
    [0.55, 0, 0],
    [0, 0, 0],
  ]),
  rotationTrack("EarLeft", eatTimes, [
    [0, 0, 0.12],
    [0.22, 0, 0.22],
    [0.16, 0, 0.18],
    [0.22, 0, 0.22],
    [0, 0, 0.12],
  ]),
  rotationTrack("EarRight", eatTimes, [
    [0, 0, -0.12],
    [0.22, 0, -0.22],
    [0.16, 0, -0.18],
    [0.22, 0, -0.22],
    [0, 0, -0.12],
  ]),
]);

const exporter = new GLTFExporter();
const glb = await exporter.parseAsync(rabbit, {
  binary: true,
  animations: [idle, walk, run, eat],
});
const outputDirectory = new URL("../public/models/", import.meta.url);
await mkdir(outputDirectory, { recursive: true });
await writeFile(new URL("rabbit.glb", outputDirectory), Buffer.from(glb));
