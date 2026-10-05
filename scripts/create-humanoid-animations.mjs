import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as THREE from "three";

const sourcePath = resolve(process.argv[2]);
const outputPath = resolve(process.argv[3]);
const isRobotProfile = outputPath.includes("futuristic-robot");

if (!process.argv[2] || !process.argv[3]) {
  throw new Error(
    "Usage: node scripts/create-humanoid-animations.mjs <input.glb> <output.glb>",
  );
}

const source = await readFile(sourcePath);
const { json, binary } = parseGlb(source);
const nodesByName = new Map(
  (json.nodes ?? []).map((node, index) => [node.name, { index, node }]),
);

const requiredBones = [
  "Root",
  "Hip",
  "Waist",
  "Spine01",
  "Spine02",
  "Head",
  "L_Thigh",
  "L_Calf",
  "L_Foot",
  "R_Thigh",
  "R_Calf",
  "R_Foot",
  "L_Upperarm",
  "L_Forearm",
  "L_Hand",
  "R_Upperarm",
  "R_Forearm",
  "R_Hand",
];

for (const boneName of requiredBones) {
  if (!nodesByName.has(boneName)) {
    throw new Error(`Missing required humanoid bone: ${boneName}`);
  }
}

json.bufferViews ??= [];
json.accessors ??= [];
json.animations = [];

let animationBinary = Buffer.alloc(0);

function appendAccessor(values, type, itemSize, includeBounds = false) {
  const alignment = (4 - (animationBinary.length % 4)) % 4;
  if (alignment) {
    animationBinary = Buffer.concat([animationBinary, Buffer.alloc(alignment)]);
  }

  const byteOffset = binary.length + animationBinary.length;
  const data = Buffer.from(values.buffer, values.byteOffset, values.byteLength);
  animationBinary = Buffer.concat([animationBinary, data]);

  const bufferViewIndex = json.bufferViews.length;
  json.bufferViews.push({ buffer: 0, byteOffset, byteLength: data.length });

  const accessor = {
    bufferView: bufferViewIndex,
    componentType: 5126,
    count: values.length / itemSize,
    type,
  };

  if (includeBounds) {
    accessor.min = [Math.min(...values)];
    accessor.max = [Math.max(...values)];
  }

  json.accessors.push(accessor);
  return json.accessors.length - 1;
}

function restQuaternion(boneName) {
  return new THREE.Quaternion(
    ...(nodesByName.get(boneName).node.rotation ?? [0, 0, 0, 1]),
  );
}

function restTranslation(boneName) {
  return new THREE.Vector3(
    ...(nodesByName.get(boneName).node.translation ?? [0, 0, 0]),
  );
}

function rotationValues(boneName, degreeFrames) {
  const rest = restQuaternion(boneName);
  const values = [];
  let previous = null;

  for (const [x, y, z] of degreeFrames) {
    const delta = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(x),
        THREE.MathUtils.degToRad(y),
        THREE.MathUtils.degToRad(z),
        "XYZ",
      ),
    );
    const value = rest.clone().multiply(delta).normalize();
    if (previous && previous.dot(value) < 0) {
      value.set(-value.x, -value.y, -value.z, -value.w);
    }
    values.push(value.x, value.y, value.z, value.w);
    previous = value;
  }

  return new Float32Array(values);
}

function translationValues(boneName, deltaFrames) {
  const rest = restTranslation(boneName);
  return new Float32Array(
    deltaFrames.flatMap(([x, y, z]) => [rest.x + x, rest.y + y, rest.z + z]),
  );
}

function addClip(name, times, tracks) {
  const input = appendAccessor(new Float32Array(times), "SCALAR", 1, true);
  const samplers = [];
  const channels = [];

  for (const track of tracks) {
    if (track.frames.length !== times.length) {
      throw new Error(`${name}/${track.bone} has the wrong keyframe count.`);
    }

    const isRotation = track.path === "rotation";
    const output = appendAccessor(
      isRotation
        ? rotationValues(track.bone, track.frames)
        : translationValues(track.bone, track.frames),
      isRotation ? "VEC4" : "VEC3",
      isRotation ? 4 : 3,
    );
    const sampler = samplers.length;
    samplers.push({ input, output, interpolation: "LINEAR" });
    channels.push({
      sampler,
      target: { node: nodesByName.get(track.bone).index, path: track.path },
    });
  }

  json.animations.push({ name, samplers, channels });
}

const rotation = (bone, frames) => ({ bone, path: "rotation", frames });
const translation = (bone, frames) => ({ bone, path: "translation", frames });
const mirror = (frames) => frames.map(([x, y, z]) => [-x, -y, -z]);
const repeatFrame = (count, frame) =>
  Array.from({ length: count }, () => [...frame]);
const halfCycleShift = (frames) => {
  const cycle = frames.slice(0, -1);
  const offset = cycle.length / 2;
  const shifted = cycle.map((_, index) => [...cycle[(index + offset) % cycle.length]]);
  return [...shifted, [...shifted[0]]];
};
const relaxedLeftArmZ = isRobotProfile ? 0 : -72;
const relaxedRightArmZ = isRobotProfile ? 0 : 72;

addClip("idle", [0, 0.6, 1.2, 1.8, 2.4], [
  rotation("Waist", [[0, 0, 0], [1, 0, 1], [0, 0, 0], [-1, 0, -1], [0, 0, 0]]),
  rotation("Spine02", [[0, 0, 0], [-1, 0, 1.5], [0, 0, 0], [1, 0, -1.5], [0, 0, 0]]),
  rotation("Head", [[0, 0, 0], [0, -2, 0.5], [0, 0, 0], [0, 2, -0.5], [0, 0, 0]]),
  rotation("L_Upperarm", [[0, 0, relaxedLeftArmZ], [isRobotProfile ? 0 : 1, 0, relaxedLeftArmZ - 1], [0, 0, relaxedLeftArmZ], [isRobotProfile ? 0 : -1, 0, relaxedLeftArmZ + 1], [0, 0, relaxedLeftArmZ]]),
  rotation("R_Upperarm", [[0, 0, relaxedRightArmZ], [isRobotProfile ? 0 : -1, 0, relaxedRightArmZ + 1], [0, 0, relaxedRightArmZ], [isRobotProfile ? 0 : 1, 0, relaxedRightArmZ - 1], [0, 0, relaxedRightArmZ]]),
]);

const walkTimes = isRobotProfile
  ? [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]
  : [0, 0.25, 0.5, 0.75, 1];
const walkLeftLeg = isRobotProfile
  ? [[30, 0, -11], [22, 0, -11], [8, 0, -11], [-12, 0, -11], [-25, 0, -11], [-8, 0, -11], [48, 0, -11], [55, 0, -11], [30, 0, -11]]
  : [[24, 0, 0], [0, 0, 0], [-24, 0, 0], [0, 0, 0], [24, 0, 0]];
const walkRightLeg = isRobotProfile
  ? halfCycleShift(walkLeftLeg).map(([x, y]) => [x, y, 14])
  : mirror(walkLeftLeg);
const walkLeftCalf = isRobotProfile
  ? [[-6, 0, 0], [-14, 0, 0], [-10, 0, 0], [-6, 0, 0], [-18, 0, 0], [-58, 0, 0], [-82, 0, 0], [-38, 0, 0], [-6, 0, 0]]
  : [[3, 0, 0], [28, 0, 0], [5, 0, 0], [12, 0, 0], [3, 0, 0]];
const walkRightCalf = isRobotProfile
  ? [[-18, 0, 0], [-58, 0, 0], [-82, 0, 0], [-38, 0, 0], [-6, 0, 0], [-14, 0, 0], [-10, 0, 0], [-6, 0, 0], [-18, 0, 0]]
  : [walkLeftCalf[2], walkLeftCalf[3], walkLeftCalf[0], walkLeftCalf[1], walkLeftCalf[2]];
const walkLeftFoot = isRobotProfile
  ? [[-8, 0, 0], [2, 0, 0], [8, 0, 0], [12, 0, 0], [22, 0, 0], [-12, 0, 0], [-24, 0, 0], [-12, 0, 0], [-8, 0, 0]]
  : [[-8, 0, 0], [8, 0, 0], [12, 0, 0], [0, 0, 0], [-8, 0, 0]];
const walkRightFoot = isRobotProfile
  ? [[22, 0, 0], [-12, 0, 0], [-24, 0, 0], [-12, 0, 0], [-8, 0, 0], [2, 0, 0], [8, 0, 0], [12, 0, 0], [22, 0, 0]]
  : [walkLeftFoot[2], walkLeftFoot[3], walkLeftFoot[4], walkLeftFoot[1], walkLeftFoot[2]];
const walkHip = isRobotProfile
  ? [[0, -1.5, 0], [0, -1, 0], [0, 0, 0], [0, 1, 0], [0, 1.5, 0], [0, 1, 0], [0, 0, 0], [0, -1, 0], [0, -1.5, 0]]
  : [[0, 0, 2], [0, 0, 0], [0, 0, -2], [0, 0, 0], [0, 0, 2]];
const walkSpine = isRobotProfile
  ? [[2, 1.5, 0], [2, 1, 0], [2, 0, 0], [2, -1, 0], [2, -1.5, 0], [2, -1, 0], [2, 0, 0], [2, 1, 0], [2, 1.5, 0]]
  : [[0, -2, -1], [0, 0, 0], [0, 2, 1], [0, 0, 0], [0, -2, -1]];
const walkWaist = isRobotProfile
  ? repeatFrame(walkTimes.length, [6, 0, 0])
  : null;
const walkArmSwing = isRobotProfile ? 0.45 : 0.42;
const walkLeftArm = mirror(walkLeftLeg).map(([x]) => [x * walkArmSwing, 0, relaxedLeftArmZ]);
const walkRightArm = walkLeftLeg.map(([x]) => [x * walkArmSwing, 0, relaxedRightArmZ]);
const walkForearm = isRobotProfile
  ? repeatFrame(walkTimes.length, [10, 0, 0])
  : [[7, 0, 0], [8, 0, 0], [7, 0, 0], [8, 0, 0], [7, 0, 0]];

addClip("walk", walkTimes, [
  ...(isRobotProfile
    ? [translation("Root", [[0, -0.041, 0], [0, -0.016, 0], [0, -0.004, 0], [0, -0.031, 0], [0, -0.042, 0], [0, -0.017, 0], [0, -0.005, 0], [0, -0.031, 0], [0, -0.041, 0]])]
    : []),
  rotation("Hip", walkHip),
  ...(walkWaist ? [rotation("Waist", walkWaist)] : []),
  rotation("Spine02", walkSpine),
  rotation("L_Thigh", walkLeftLeg),
  rotation("R_Thigh", walkRightLeg),
  rotation("L_Calf", walkLeftCalf),
  rotation("R_Calf", walkRightCalf),
  rotation("L_Foot", walkLeftFoot),
  rotation("R_Foot", walkRightFoot),
  rotation("L_Upperarm", walkLeftArm),
  rotation("R_Upperarm", walkRightArm),
  rotation("L_Forearm", walkForearm),
  rotation("R_Forearm", walkForearm),
]);

const runTimes = isRobotProfile
  ? [0, 0.0875, 0.175, 0.2625, 0.35, 0.4375, 0.525, 0.6125, 0.7]
  : [0, 0.175, 0.35, 0.525, 0.7];
const runLeftLeg = isRobotProfile
  ? [[38, 0, -11], [28, 0, -11], [5, 0, -11], [-18, 0, -11], [-32, 0, -11], [-10, 0, -11], [58, 0, -11], [70, 0, -11], [38, 0, -11]]
  : [[38, 0, 0], [0, 0, 0], [-38, 0, 0], [0, 0, 0], [38, 0, 0]];
const runRightLeg = isRobotProfile
  ? halfCycleShift(runLeftLeg).map(([x, y]) => [x, y, 14])
  : mirror(runLeftLeg);
const runLeftCalf = isRobotProfile
  ? [[-10, 0, 0], [-20, 0, 0], [-14, 0, 0], [-8, 0, 0], [-24, 0, 0], [-72, 0, 0], [-100, 0, 0], [-48, 0, 0], [-10, 0, 0]]
  : [[5, 0, 0], [52, 0, 0], [8, 0, 0], [28, 0, 0], [5, 0, 0]];
const runRightCalf = isRobotProfile
  ? [[-24, 0, 0], [-72, 0, 0], [-100, 0, 0], [-48, 0, 0], [-10, 0, 0], [-20, 0, 0], [-14, 0, 0], [-8, 0, 0], [-24, 0, 0]]
  : [[8, 0, 0], [28, 0, 0], [5, 0, 0], [52, 0, 0], [8, 0, 0]];
const runLeftFoot = isRobotProfile
  ? [[-14, 0, 0], [-2, 0, 0], [12, 0, 0], [18, 0, 0], [28, 0, 0], [-18, 0, 0], [-30, 0, 0], [-14, 0, 0], [-14, 0, 0]]
  : [[-14, 0, 0], [14, 0, 0], [18, 0, 0], [-4, 0, 0], [-14, 0, 0]];
const runRightFoot = isRobotProfile
  ? [[28, 0, 0], [-18, 0, 0], [-30, 0, 0], [-14, 0, 0], [-14, 0, 0], [-2, 0, 0], [12, 0, 0], [18, 0, 0], [28, 0, 0]]
  : [[18, 0, 0], [-4, 0, 0], [-14, 0, 0], [14, 0, 0], [18, 0, 0]];
const runHip = isRobotProfile
  ? [[0, -2, 0], [0, -1, 0], [0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 1, 0], [0, 0, 0], [0, -1, 0], [0, -2, 0]]
  : [[0, 0, 3], [2, 0, 0], [0, 0, -3], [-2, 0, 0], [0, 0, 3]];
const runWaist = isRobotProfile
  ? repeatFrame(runTimes.length, [15, 0, 0])
  : [[8, 0, 0], [10, 0, 0], [8, 0, 0], [10, 0, 0], [8, 0, 0]];
const runSpine = isRobotProfile
  ? [[5, 2, 0], [6, 1, 0], [5, 0, 0], [6, -1, 0], [5, -2, 0], [6, -1, 0], [5, 0, 0], [6, 1, 0], [5, 2, 0]]
  : [[-4, -3, -2], [-5, 0, 0], [-4, 3, 2], [-5, 0, 0], [-4, -3, -2]];
const runArmSwing = isRobotProfile ? 0.55 : 0.48;
const runLeftArm = mirror(runLeftLeg).map(([x]) => [x * runArmSwing, 0, isRobotProfile ? 0 : -70]);
const runRightArm = runLeftLeg.map(([x]) => [x * runArmSwing, 0, isRobotProfile ? 0 : 70]);
const runForearm = isRobotProfile
  ? repeatFrame(runTimes.length, [18, 0, 0])
  : [[13, 0, 0], [16, 0, 0], [13, 0, 0], [16, 0, 0], [13, 0, 0]];

addClip("run", runTimes, [
  ...(isRobotProfile
    ? [translation("Root", [[0, -0.066, 0], [0, -0.027, 0], [0, -0.011, 0], [0, -0.057, 0], [0, -0.067, 0], [0, -0.028, 0], [0, -0.012, 0], [0, -0.057, 0], [0, -0.066, 0]])]
    : []),
  rotation("Hip", runHip),
  rotation("Waist", runWaist),
  rotation("Spine02", runSpine),
  rotation("L_Thigh", runLeftLeg),
  rotation("R_Thigh", runRightLeg),
  rotation("L_Calf", runLeftCalf),
  rotation("R_Calf", runRightCalf),
  rotation("L_Foot", runLeftFoot),
  rotation("R_Foot", runRightFoot),
  rotation("L_Upperarm", runLeftArm),
  rotation("R_Upperarm", runRightArm),
  rotation("L_Forearm", runForearm),
  rotation("R_Forearm", runForearm),
]);

if (isRobotProfile) {
  const jumpTimes = [0, 0.12, 0.26, 0.46, 0.64, 0.84];
  const jumpLeftThigh = [[0, 0, -11], [32, 0, -11], [-12, 0, -11], [24, 0, -11], [30, 0, -11], [0, 0, -11]];
  const jumpRightThigh = jumpLeftThigh.map(([x, y]) => [x, y, 14]);
  const jumpCalf = [[0, 0, 0], [-72, 0, 0], [-12, 0, 0], [-58, 0, 0], [-70, 0, 0], [0, 0, 0]];
  const jumpFoot = [[0, 0, 0], [22, 0, 0], [-12, 0, 0], [18, 0, 0], [24, 0, 0], [0, 0, 0]];
  const jumpLeftArm = [[0, 0, 0], [-18, 0, 0], [38, 0, 0], [30, 0, 0], [8, 0, 0], [0, 0, 0]];
  const jumpRightArm = jumpLeftArm.map(([x, y, z]) => [x, y, z]);

  addClip("jump", jumpTimes, [
    rotation("Hip", [[0, 0, 0], [8, 0, 0], [3, 0, 0], [6, 0, 0], [9, 0, 0], [0, 0, 0]]),
    rotation("Waist", [[8, 0, 0], [14, 0, 0], [10, 0, 0], [7, 0, 0], [12, 0, 0], [8, 0, 0]]),
    rotation("Spine02", [[3, 0, 0], [6, 0, 0], [4, 0, 0], [2, 0, 0], [5, 0, 0], [3, 0, 0]]),
    rotation("L_Thigh", jumpLeftThigh),
    rotation("R_Thigh", jumpRightThigh),
    rotation("L_Calf", jumpCalf),
    rotation("R_Calf", jumpCalf),
    rotation("L_Foot", jumpFoot),
    rotation("R_Foot", jumpFoot),
    rotation("L_Upperarm", jumpLeftArm),
    rotation("R_Upperarm", jumpRightArm),
    rotation("L_Forearm", [[12, 0, 0], [8, 0, 0], [20, 0, 0], [18, 0, 0], [14, 0, 0], [12, 0, 0]]),
    rotation("R_Forearm", [[12, 0, 0], [8, 0, 0], [20, 0, 0], [18, 0, 0], [14, 0, 0], [12, 0, 0]]),
  ]);
}

const waveLeftArm = isRobotProfile
  ? [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]
  : [[0, 0, -72], [0, 0, -72], [0, 0, -72], [0, 0, -72], [0, 0, -72], [0, 0, -72], [0, 0, -72]];
const waveRightArm = isRobotProfile
  ? [[0, 0, 0], [0, 0, -35], [0, 0, -35], [0, 0, -35], [0, 0, -35], [0, 0, -15], [0, 0, 0]]
  : [[0, 0, 72], [0, 0, -8], [0, 0, -8], [0, 0, -8], [0, 0, -8], [0, 0, 35], [0, 0, 72]];
const waveRightForearm = isRobotProfile
  ? [[0, 0, 0], [0, 0, -25], [0, 0, -42], [0, 0, -20], [0, 0, -42], [0, 0, -15], [0, 0, 0]]
  : [[0, 0, 0], [0, 0, -72], [0, 0, -105], [0, 0, -55], [0, 0, -105], [0, 0, -35], [0, 0, 0]];

addClip("wave", [0, 0.35, 0.7, 1.05, 1.4, 1.75, 2.1], [
  rotation("Spine02", [[0, 0, 0], [0, -4, 0], [0, -4, 0], [0, -4, 0], [0, -4, 0], [0, -2, 0], [0, 0, 0]]),
  rotation("Head", [[0, 0, 0], [0, 5, 0], [0, 5, 0], [0, 5, 0], [0, 5, 0], [0, 2, 0], [0, 0, 0]]),
  rotation("L_Upperarm", waveLeftArm),
  rotation("R_Upperarm", waveRightArm),
  rotation("R_Forearm", waveRightForearm),
  rotation("R_Hand", [[0, 0, 0], [0, 15, 0], [0, -18, 0], [0, 18, 0], [0, -18, 0], [0, 8, 0], [0, 0, 0]]),
]);

const finalBinary = Buffer.concat([binary, animationBinary]);
json.buffers[0].byteLength = finalBinary.length;
await writeFile(outputPath, buildGlb(json, finalBinary));

console.log(
  `Created ${outputPath} with ${json.animations.length} clips: ${json.animations.map(({ name }) => name).join(", ")}`,
);

function parseGlb(bytes) {
  if (bytes.toString("utf8", 0, 4) !== "glTF") {
    throw new Error("Input is not a binary glTF file.");
  }

  const jsonLength = bytes.readUInt32LE(12);
  const jsonType = bytes.toString("utf8", 16, 20);
  if (jsonType !== "JSON") throw new Error("GLB has no JSON chunk.");

  const jsonStart = 20;
  const jsonEnd = jsonStart + jsonLength;
  const binaryLength = bytes.readUInt32LE(jsonEnd);
  const binaryType = bytes.toString("utf8", jsonEnd + 4, jsonEnd + 8);
  if (binaryType !== "BIN\u0000") throw new Error("GLB has no binary chunk.");

  return {
    json: JSON.parse(bytes.toString("utf8", jsonStart, jsonEnd)),
    binary: bytes.subarray(jsonEnd + 8, jsonEnd + 8 + binaryLength),
  };
}

function buildGlb(json, binary) {
  const jsonData = Buffer.from(JSON.stringify(json));
  const jsonPadding = (4 - (jsonData.length % 4)) % 4;
  const paddedJson = Buffer.concat([jsonData, Buffer.alloc(jsonPadding, 0x20)]);
  const binaryPadding = (4 - (binary.length % 4)) % 4;
  const paddedBinary = Buffer.concat([binary, Buffer.alloc(binaryPadding)]);
  const totalLength = 12 + 8 + paddedJson.length + 8 + paddedBinary.length;
  const header = Buffer.alloc(12);
  header.write("glTF", 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(paddedJson.length, 0);
  jsonHeader.write("JSON", 4);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(paddedBinary.length, 0);
  binaryHeader.write("BIN\u0000", 4);
  return Buffer.concat([
    header,
    jsonHeader,
    paddedJson,
    binaryHeader,
    paddedBinary,
  ]);
}
