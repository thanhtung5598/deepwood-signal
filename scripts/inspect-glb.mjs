import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const inputPath = resolve(process.argv[2] ?? "public/models/rabbit.glb");
const bytes = await readFile(inputPath);

if (bytes.toString("utf8", 0, 4) !== "glTF") {
  throw new Error(`${inputPath} is not a binary glTF file.`);
}

const jsonChunkLength = bytes.readUInt32LE(12);
const jsonChunkType = bytes.toString("utf8", 16, 20);
if (jsonChunkType !== "JSON") throw new Error("GLB has no JSON chunk.");

const json = JSON.parse(bytes.toString("utf8", 20, 20 + jsonChunkLength));
const parents = new Map();

json.nodes?.forEach((node, parentIndex) => {
  node.children?.forEach((childIndex) => parents.set(childIndex, parentIndex));
});

const skinJoints = new Set(json.skins?.flatMap((skin) => skin.joints) ?? []);
const nodeLabel = (index) => json.nodes?.[index]?.name || `node_${index}`;
const joints = [...skinJoints].map((index) => ({
  index,
  name: nodeLabel(index),
  parent: parents.has(index) ? nodeLabel(parents.get(index)) : "—",
  translation: json.nodes[index].translation ?? [0, 0, 0],
  rotation: json.nodes[index].rotation ?? [0, 0, 0, 1],
  scale: json.nodes[index].scale ?? [1, 1, 1],
}));

if (process.argv.includes("--compact")) {
  for (const joint of joints) {
    console.log(
      `${joint.index}\t${joint.name}\t<- ${joint.parent}\tpos=${joint.translation.map((value) => value.toFixed(3)).join(",")}`,
    );
  }
  process.exit(0);
}

console.log(JSON.stringify({
  file: inputPath,
  generator: json.asset?.generator,
  byteLength: bytes.length,
  meshes: json.meshes?.length ?? 0,
  skins: (json.skins ?? []).map((skin, index) => ({
    index,
    name: skin.name ?? "",
    joints: skin.joints.length,
    skeleton: skin.skeleton == null ? null : nodeLabel(skin.skeleton),
  })),
  animations: (json.animations ?? []).map((animation, index) => ({
    index,
    name: animation.name ?? "",
    channels: animation.channels.length,
  })),
  joints,
}, null, 2));
