import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import assortment from "../src/data/new-assortment.json" with { type: "json" };

const ROOT = path.resolve("public/image/catalog");
const START_ID = Number(process.argv[2] || 106);
const TARGET = 1254;
const primaryViews = ["front", "back", "model-detail", "model-outfit", "logo-tag"];

const duplicateNames = new Set(
  assortment
    .map((item) => item.name)
    .filter((name, index, names) => names.indexOf(name) !== index)
);

const slugify = (value) => value.toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const folderFor = (product) => {
  const type = product.productType.toLowerCase();
  const productFolder = duplicateNames.has(product.name)
    ? `${slugify(product.name)}-${product.id}`
    : slugify(product.name);
  return path.join(ROOT, type, productFolder, "raw-v1");
};

const productDNA = (product, color) => [
  `Maison Rue ${product.audience === "women" ? "women's" : "men's"} ${product.name}`,
  `color ${color}`,
  `category ${product.productType}, ${product.subcategory}`,
  "quiet luxury, realistic premium materials, anatomically and structurally correct",
  "warm ivory neutral palette, soft diffused light",
  "square 1:1, single independent image, no collage, no border, no unrelated props"
].join("; ");

const viewInstruction = {
  front: "front three-quarter product view; entire product fully visible with generous margin",
  back: "rear three-quarter product view; preserve exactly the same construction and proportions",
  "model-detail": "close lifestyle crop with the product clearly visible and unobstructed",
  "model-outfit": "full-body head-to-toe quiet-luxury outfit; product remains clearly visible",
  "logo-tag": "macro craftsmanship detail with a subtle accurate MAISON RUE mark"
};

const queue = [];
for (const product of assortment.filter((item) => item.id >= START_ID)) {
  const folder = folderFor(product);
  fs.mkdirSync(folder, { recursive: true });
  const colors = product.colors.map(slugify);
  const expected = [];
  colors.forEach((color, index) => {
    const views = index === 0 ? primaryViews : ["front", "back"];
    views.forEach((view) => expected.push(`${color}-${view}.png`));
  });
  const presentFiles = fs.existsSync(folder) ? fs.readdirSync(folder) : [];
  const present = new Set(presentFiles.filter((name) => /\.(png|webp)$/i.test(name)));
  const hasAsset = (pngName) => present.has(pngName) || present.has(pngName.replace(/\.png$/i, ".webp"));
  const missing = expected.filter((name) => !hasAsset(name));
  for (const file of missing) {
    const view = primaryViews.find((candidate) => file.endsWith(`-${candidate}.png`));
    const colorSlug = file.slice(0, -(`-${view}.png`.length));
    const color = product.colors.find((item) => slugify(item) === colorSlug) || colorSlug;
    queue.push({
      productId: product.id,
      productName: product.name,
      color,
      view,
      referenceImage: view === "front"
        ? null
        : path.relative(
          process.cwd(),
          path.join(folder, present.has(`${colorSlug}-front.png`) ? `${colorSlug}-front.png` : `${colorSlug}-front.webp`)
        ).replaceAll("\\", "/"),
      output: path.relative(process.cwd(), path.join(folder, file)).replaceAll("\\", "/"),
      prompt: `${productDNA(product, color)}; ${viewInstruction[view]}.`
    });
  }
  console.log(`${product.id} ${product.name}: ${expected.length - missing.length}/${expected.length} files, missing ${missing.length}`);
}

const output = path.resolve("catalog-image-queue.json");
fs.writeFileSync(output, `${JSON.stringify({ targetSize: TARGET, generatedAt: new Date().toISOString(), queue }, null, 2)}\n`);
console.log(`Queue written: ${output}`);
console.log(`Remaining assets: ${queue.length}`);
