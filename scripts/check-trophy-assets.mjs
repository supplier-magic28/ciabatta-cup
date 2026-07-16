import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import validator from "gltf-validator";

const root = process.cwd();
const assets = [
  {
    key: "claymore",
    model: "public/trophies/claymore-v1.glb",
    poster: "public/trophies/claymore-v1.webp",
    source: "design-reference/trophy-model-sources/claymore-v1.blend",
  },
  {
    key: "ranked_cup",
    model: "public/trophies/ranked-cup-v1.glb",
    poster: "public/trophies/ranked-cup-v1.webp",
    source: "design-reference/trophy-model-sources/ranked-cup-v1.blend",
  },
];
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_TRIANGLES = 100_000;
const MAX_MATERIALS = 10;

for (const asset of assets) {
  const [modelBytes, modelStat, posterStat, sourceStat] = await Promise.all([
    readFile(path.join(root, asset.model)),
    stat(path.join(root, asset.model)),
    stat(path.join(root, asset.poster)),
    stat(path.join(root, asset.source)),
  ]);
  if (modelStat.size > MAX_BYTES) throw new Error(`${asset.key} GLB exceeds the 5 MB mobile budget.`);
  if (!posterStat.size || !sourceStat.size) throw new Error(`${asset.key} poster or Blender source is empty.`);

  const report = await validator.validateBytes(new Uint8Array(modelBytes), {
    uri: asset.model,
    format: "glb",
    maxIssues: 50,
    writeTimestamp: false,
  });
  if (report.issues.numErrors) throw new Error(`${asset.key} GLB has ${report.issues.numErrors} validation errors.\n${JSON.stringify(report.issues.messages, null, 2)}`);
  if (report.info.totalTriangleCount > MAX_TRIANGLES) throw new Error(`${asset.key} GLB exceeds ${MAX_TRIANGLES} triangles.`);
  if (report.info.materialCount > MAX_MATERIALS) throw new Error(`${asset.key} GLB exceeds ${MAX_MATERIALS} materials.`);
  console.log(`${asset.key}: ${(modelStat.size / 1024).toFixed(0)} KB, ${report.info.totalTriangleCount} triangles, ${report.info.materialCount} materials, ${report.issues.numWarnings} warnings`);
}
