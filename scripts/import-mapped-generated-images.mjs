import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const mappingFile = process.argv[2] || "output/imagegen/catalog-completion/gallery-import-map.json";
const mapping = JSON.parse(await fs.readFile(mappingFile, "utf8"));
const { default: sharp } = await import(pathToFileURL(process.env.SHARP_MODULE).href);
for (const { source, target } of mapping) {
  await fs.access(source);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await sharp(source).webp({ quality: 90 }).toFile(target);
  console.log(target);
}
