import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as THREE from "three";

const sourcePath = resolve(
  process.argv[2] ?? "public/models/rabbit-rigged.glb",
);
const outputPath = resolve(
  process.argv[3] ?? "public/models/rabbit-animated.glb",
);

const source = await readFile(sourcePath);
const { json, binary } = parseGlb(source);
const nodesByName = new Map(
  json.nodes.map((node, index) => [node.name, { index, node }]),
);

const requiredBones = [
  "tripo::Root",
  "tripo::Spine_0",
  "tripo::Spine_1",
  "tripo::Spine_2",
  "tripo::Spine_3",
  "tripo::Head_0",
  "tripo::0_Left_Limb_0",
  "tripo::0_Left_Limb_1",
  "tripo::0_Right_Limb_0",
  "tripo::0_Right_Limb_1",
  "tripo::1_Left_Limb_0",
  "tripo::1_Left_Limb_1",
  "tripo::1_Left_Limb_2",
  "tripo::1_Right_Limb_0",
  "tripo::1_Right_Limb_1",
  "tripo::1_Right_Limb_2",
  "tripo::Tail_0",
  "tripo::Tail_1",
  "bone_63",
  "bone_65",
];

for (const boneName of requiredBones) {
  if (!nodesByName.has(boneName)) {
    throw new Error(`Missing required rabbit bone: ${boneName}`);
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
  const data = Buffer.from(
    values.buffer,
    values.byteOffset,
    values.byteLength,
  );
  animationBinary = Buffer.concat([animationBinary, data]);

  const bufferViewIndex = json.bufferViews.length;
  json.bufferViews.push({
    buffer: 0,
    byteOffset,
    byteLength: data.length,
  });

  const accessor = {
    bufferView: bufferViewIndex,
    componentType: 5126,
    count: values.length / itemSize,
    type,
  };

  if (includeBounds) {
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    for (const value of values) {
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
    accessor.min = [minimum];
    accessor.max = [maximum];
  }

  json.accessors.push(accessor);
  return json.accessors.length - 1;
}

function restQuaternion(boneName) {
  const rotation = nodesByName.get(boneName).node.rotation ?? [0, 0, 0, 1];
  return new THREE.Quaternion(...rotation);
}

function restTranslation(boneName) {
  const translation = nodesByName.get(boneName).node.translation ?? [0, 0, 0];
  return new THREE.Vector3(...translation);
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

function translationSplineValues(boneName, deltaFrames, times) {
  const rest = restTranslation(boneName);
  const values = deltaFrames.map(
    ([x, y, z]) => new THREE.Vector3(rest.x + x, rest.y + y, rest.z + z),
  );
  const tangents = values.map(() => new THREE.Vector3());

  // Monotone cubic tangents keep the crouch/apex/landing peaks soft without
  // overshooting them. The first and last tangent stay at zero so the loop
  // has a short, natural ground-contact moment instead of snapping.
  for (let index = 1; index < values.length - 1; index += 1) {
    for (const axis of ["x", "y", "z"]) {
      const previousSlope =
        (values[index][axis] - values[index - 1][axis]) /
        (times[index] - times[index - 1]);
      const nextSlope =
        (values[index + 1][axis] - values[index][axis]) /
        (times[index + 1] - times[index]);
      tangents[index][axis] =
        previousSlope * nextSlope <= 0
          ? 0
          : (2 * previousSlope * nextSlope) / (previousSlope + nextSlope);
    }
  }

  return new Float32Array(
    values.flatMap((value, index) => {
      const tangent = tangents[index];
      return [
        tangent.x,
        tangent.y,
        tangent.z,
        value.x,
        value.y,
        value.z,
        tangent.x,
        tangent.y,
        tangent.z,
      ];
    }),
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
    const isCubicTranslation =
      !isRotation && track.interpolation === "CUBICSPLINE";
    const output = appendAccessor(
      isRotation
        ? rotationValues(track.bone, track.frames)
        : isCubicTranslation
          ? translationSplineValues(track.bone, track.frames, times)
          : translationValues(track.bone, track.frames),
      isRotation ? "VEC4" : "VEC3",
      isRotation ? 4 : 3,
    );
    const samplerIndex = samplers.length;
    samplers.push({
      input,
      output,
      interpolation: track.interpolation ?? "LINEAR",
    });
    channels.push({
      sampler: samplerIndex,
      target: {
        node: nodesByName.get(track.bone).index,
        path: track.path,
      },
    });
  }

  json.animations.push({ name, samplers, channels });
}

const rotation = (bone, frames) => ({ bone, path: "rotation", frames });
const zFrames = (values) => values.map((z) => [0, 0, z]);
const translation = (bone, frames, interpolation = "LINEAR") => ({
  bone,
  path: "translation",
  frames,
  interpolation,
});

addClip("idle", [0, 0.6, 1.2, 1.8, 2.4], [
  rotation("tripo::Spine_1", [[0, 0, 0], [0, 0, 1.5], [0, 0, 0], [0, 0, -1.5], [0, 0, 0]]),
  rotation("tripo::Head_0", [[0, 0, 0], [0, 0, -1], [0, 0, 0], [0, 0, 1], [0, 0, 0]]),
  rotation("bone_63", [[0, 0, 0], [0, 0, 2], [0, 0, 0], [0, 0, -4], [0, 0, 0]]),
  rotation("bone_65", [[0, 0, 0], [0, 0, -2], [0, 0, 0], [0, 0, 4], [0, 0, 0]]),
  rotation("tripo::Tail_0", [[0, 0, 0], [0, 0, 4], [0, 0, 0], [0, 0, -4], [0, 0, 0]]),
]);

// Rabbit locomotion is a bound: the hind legs compress and push together,
// the body stretches during flight, the forefeet land first, then the hind
// feet swing underneath the pelvis. These deliberately offset poses keep the
// four legs from looking like rigid rods moving at the same time.
const hopTimes = [0, 0.1, 0.22, 0.38, 0.53, 0.67, 0.8, 0.93, 1.1];
const hopFrontUpper = zFrames([0, 14, -32, -48, -55, -26, 30, 16, 0]);
const hopFrontLower = zFrames([0, -22, 18, 32, 42, 26, -24, -16, 0]);
const hopHindUpper = zFrames([0, 54, -46, -28, 38, 64, 22, 44, 0]);
const hopHindLower = zFrames([0, -80, 42, 24, -52, -86, -26, -68, 0]);
const hopHindFoot = zFrames([0, 44, -24, -12, 34, 62, 14, 38, 0]);

addClip("hop", hopTimes, [
  translation("tripo::Root", [[0, 0, 0], [0, -0.07, 0], [0, 0.04, 0], [0, 0.16, 0], [0, 0.22, 0], [0, 0.17, 0], [0, 0.07, 0], [0, -0.045, 0], [0, 0, 0]], "CUBICSPLINE"),
  rotation("tripo::Spine_0", zFrames([0, 18, -18, -14, -8, 7, 17, 11, 0])),
  rotation("tripo::Spine_1", zFrames([0, 9, -10, -8, -4, 4, 9, 6, 0])),
  rotation("tripo::Spine_2", zFrames([0, 11, -13, -10, -5, 6, 12, 8, 0])),
  rotation("tripo::Spine_3", zFrames([0, 5, -7, -6, -3, 4, 7, 4, 0])),
  // Counter-rotation stabilizes the eyes while the spine flexes.
  rotation("tripo::Head_0", zFrames([0, -10, 12, 10, 6, -5, -11, -7, 0])),
  rotation("tripo::0_Left_Limb_0", hopFrontUpper),
  rotation("tripo::0_Right_Limb_0", hopFrontUpper),
  rotation("tripo::0_Left_Limb_1", hopFrontLower),
  rotation("tripo::0_Right_Limb_1", hopFrontLower),
  rotation("tripo::1_Left_Limb_0", hopHindUpper),
  rotation("tripo::1_Right_Limb_0", hopHindUpper),
  rotation("tripo::1_Left_Limb_1", hopHindLower),
  rotation("tripo::1_Right_Limb_1", hopHindLower),
  rotation("tripo::1_Left_Limb_2", hopHindFoot),
  rotation("tripo::1_Right_Limb_2", hopHindFoot),
  rotation("tripo::Tail_0", zFrames([0, -12, 14, 20, 17, 4, -10, -7, 0])),
  rotation("bone_63", zFrames([0, -8, 6, 11, 8, 1, -6, -3, 0])),
  rotation("bone_65", zFrames([0, 8, -6, -11, -8, -1, 6, 3, 0])),
]);

const runTimes = [0, 0.07, 0.15, 0.25, 0.36, 0.48, 0.6, 0.72];
const runFrontUpper = zFrames([0, 18, -38, -58, -60, -18, 32, 0]);
const runFrontLower = zFrames([0, -28, 22, 38, 48, 20, -28, 0]);
const runHindUpper = zFrames([0, 62, -58, -35, 38, 68, 30, 0]);
const runHindLower = zFrames([0, -88, 52, 32, -55, -92, -35, 0]);
const runHindFoot = zFrames([0, 52, -30, -18, 38, 64, 18, 0]);

addClip("run", runTimes, [
  translation("tripo::Root", [[0, 0, 0], [0, -0.08, 0], [0, 0.05, 0], [0, 0.18, 0], [0, 0.24, 0], [0, 0.15, 0], [0, -0.025, 0], [0, 0, 0]], "CUBICSPLINE"),
  rotation("tripo::Spine_0", zFrames([0, 20, -22, -15, -5, 14, 18, 0])),
  rotation("tripo::Spine_1", zFrames([0, 11, -13, -9, -3, 8, 10, 0])),
  rotation("tripo::Spine_2", zFrames([0, 13, -15, -10, -3, 10, 12, 0])),
  rotation("tripo::Spine_3", zFrames([0, 6, -8, -6, -2, 6, 7, 0])),
  rotation("tripo::Head_0", zFrames([0, -12, 16, 12, 5, -10, -12, 0])),
  rotation("tripo::0_Left_Limb_0", runFrontUpper),
  rotation("tripo::0_Right_Limb_0", runFrontUpper),
  rotation("tripo::0_Left_Limb_1", runFrontLower),
  rotation("tripo::0_Right_Limb_1", runFrontLower),
  rotation("tripo::1_Left_Limb_0", runHindUpper),
  rotation("tripo::1_Right_Limb_0", runHindUpper),
  rotation("tripo::1_Left_Limb_1", runHindLower),
  rotation("tripo::1_Right_Limb_1", runHindLower),
  rotation("tripo::1_Left_Limb_2", runHindFoot),
  rotation("tripo::1_Right_Limb_2", runHindFoot),
  rotation("tripo::Tail_0", zFrames([0, -18, 20, 25, 18, -12, -8, 0])),
  rotation("bone_63", zFrames([0, -10, 8, 13, 9, -6, -4, 0])),
  rotation("bone_65", zFrames([0, 10, -8, -13, -9, 6, 4, 0])),
]);

addClip("eat", [0, 0.4, 0.8, 1.2, 1.6, 2, 2.4], [
  rotation("tripo::Spine_2", [[0, 0, 0], [0, 0, 5], [0, 0, 11], [0, 0, 9], [0, 0, 11], [0, 0, 5], [0, 0, 0]]),
  rotation("tripo::Spine_3", [[0, 0, 0], [0, 0, 10], [0, 0, 24], [0, 0, 19], [0, 0, 24], [0, 0, 10], [0, 0, 0]]),
  rotation("tripo::Head_0", [[0, 0, 0], [0, 0, 12], [0, 0, 30], [0, 0, 24], [0, 0, 30], [0, 0, 12], [0, 0, 0]]),
  rotation("tripo::0_Left_Limb_0", [[0, 0, 0], [0, 0, 5], [0, 0, 10], [0, 0, 8], [0, 0, 10], [0, 0, 5], [0, 0, 0]]),
  rotation("tripo::0_Right_Limb_0", [[0, 0, 0], [0, 0, 5], [0, 0, 10], [0, 0, 8], [0, 0, 10], [0, 0, 5], [0, 0, 0]]),
  rotation("bone_63", [[0, 0, 0], [0, 0, -5], [0, 0, -10], [0, 0, -7], [0, 0, -10], [0, 0, -5], [0, 0, 0]]),
  rotation("bone_65", [[0, 0, 0], [0, 0, 5], [0, 0, 10], [0, 0, 7], [0, 0, 10], [0, 0, 5], [0, 0, 0]]),
]);

const finalBinary = Buffer.concat([binary, animationBinary]);
json.buffers[0].byteLength = finalBinary.length;

await writeFile(outputPath, buildGlb(json, finalBinary));

console.log(
  `Created ${outputPath} with ${json.animations.length} clips: ${json.animations.map((animation) => animation.name).join(", ")}`,
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
  const paddedJson = Buffer.concat([
    jsonData,
    Buffer.alloc(jsonPadding, 0x20),
  ]);
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
