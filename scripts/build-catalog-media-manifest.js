import fs from "node:fs";
import path from "node:path";
import assortment from "../src/data/new-assortment.json" with { type: "json" };

const ROOT = path.resolve("public/image/catalog");
const OUTPUT = path.resolve("src/data/catalog-media.json");
const primaryViews = ["front", "back", "model-detail", "model-outfit", "logo-tag"];
const secondaryViews = ["front", "back"];

const slugify = (value) => value.toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const duplicateNames = new Set(
  assortment
    .map((item) => item.name)
    .filter((name, index, names) => names.indexOf(name) !== index)
);

const manifest = {};
for (const product of assortment) {
  const baseName = slugify(product.name);
  const productRoot = path.join(ROOT, product.productType.toLowerCase(), baseName);
  const idSpecificFolder = path.join(ROOT, product.productType.toLowerCase(), `${baseName}-${product.id}`, "raw-v1");
  const audienceFolder = path.join(productRoot, `${product.audience}-raw-v1`);
  const standardFolder = path.join(productRoot, "raw-v1");
  const folder = duplicateNames.has(product.name)
    ? [idSpecificFolder, audienceFolder, standardFolder].find((candidate) => fs.existsSync(candidate))
    : standardFolder;
  if (!folder || !fs.existsSync(folder)) continue;

  const colorImages = {};
  product.colors.forEach((color, colorIndex) => {
    const colorSlug = slugify(color);
    const views = colorIndex === 0 ? primaryViews : secondaryViews;
    const images = views
      .map((view) => path.join(folder, `${colorSlug}-${view}.webp`))
      .filter((file) => fs.existsSync(file))
      .map((file) => path.relative(path.resolve("public"), file).replaceAll("\\", "/"));
    if (images.length) colorImages[color] = images;
  });

  if (Object.keys(colorImages).length) manifest[product.id] = { colorImages };
}

fs.writeFileSync(OUTPUT, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Catalog media manifest written for ${Object.keys(manifest).length} product(s)`);
