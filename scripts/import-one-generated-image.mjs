import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [source, target] = process.argv.slice(2);
if (!source || !target) throw new Error("Usage: import-one-generated-image <source> <target>");
const { default: sharp } = await import(pathToFileURL(process.env.SHARP_MODULE).href);
await fs.mkdir(path.dirname(target), { recursive: true });
await sharp(source).webp({ quality: 90 }).toFile(target);
console.log(target);
