import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const generatedRoot = "/Users/htmt1810/.codex/generated_images/01a1ab88-11ad-7d90-8865-73a5a759b72e";
const cutoffSeconds = 1794165757;
const views = ["back", "model-outfit", "model-detail", "logo-tag"];
const products = [
  [193, "clothing", "organic-cotton-baby-romper", "soft-beige"],
  [194, "clothing", "cotton-pique-polo-shirt", "navy"],
  [195, "clothing", "linen-cotton-easy-trousers", "beige"],
  [196, "clothing", "merino-cotton-knitted-cardigan", "camel"],
  [197, "clothing", "premium-cotton-essential-t-shirt", "white"],
  [198, "clothing", "cotton-poplin-dress", "ivory"],
  [199, "clothing", "cashmere-cotton-knitted-cardigan", "beige"],
  [200, "clothing", "cotton-jersey-leggings", "soft-brown"],
  [201, "clothing", "linen-relaxed-shorts", "natural-ecru"],
  [202, "clothing", "soft-leather-baby-shoes", "cream"],
  [203, "footwear", "suede-kids-penny-loafers", "dark-brown"],
  [204, "accessories", "mini-canvas-leather-backpack", "natural-ecru"],
  [205, "accessories", "mini-grained-calfskin-crossbody-bag", "dark-brown"],
  [207, "accessories", "signature-cashmere-touch-teddy-bear", "beige"],
  [208, "accessories", "mini-plush-teddy-bear", "oatmeal"]
];
const expected = products.length * views.length;

async function newImages() {
  const names = (await fs.readdir(generatedRoot)).filter((name) => name.endsWith(".png"));
  const rows = await Promise.all(names.map(async (name) => {
    const file = path.join(generatedRoot, name);
    const stat = await fs.stat(file);
    return { file, mtime: stat.mtimeMs / 1000 };
  }));
  return rows.filter(({ mtime }) => mtime > cutoffSeconds).sort((a, b) => a.mtime - b.mtime);
}

let files = await newImages();
while (files.length < expected) {
  console.log(`Waiting for gallery generation: ${files.length}/${expected}`);
  await new Promise((resolve) => setTimeout(resolve, 15000));
  files = await newImages();
}

const { default: sharp } = await import(pathToFileURL(process.env.SHARP_MODULE).href);
const mapping = [];
for (let productIndex = 0; productIndex < products.length; productIndex += 1) {
  const [id, type, slug, color] = products[productIndex];
  for (let viewIndex = 0; viewIndex < views.length; viewIndex += 1) {
    const source = files[productIndex * views.length + viewIndex].file;
    const target = `public/image/catalog/${type}/${slug}-${id}/raw-v1/${color}-${views[viewIndex]}.webp`;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await sharp(source).webp({ quality: 90 }).toFile(target);
    mapping.push({ source, target });
  }
}
await fs.writeFile("output/imagegen/catalog-completion/gallery-import-map-final.json", `${JSON.stringify(mapping, null, 2)}\n`);

execFileSync("node", ["scripts/build-catalog-media-manifest.js"], { stdio: "inherit" });
execFileSync("npm", ["run", "db:sync-media"], { stdio: "inherit" });
execFileSync("npm", ["run", "build"], { stdio: "inherit" });
console.log(`FINALIZED ${mapping.length} remaining gallery images.`);
