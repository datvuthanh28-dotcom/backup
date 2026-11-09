import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// SHARP_MODULE optionally points to an existing bundled Sharp installation.
const { default: sharp } = await import(process.env.SHARP_MODULE
  ? pathToFileURL(process.env.SHARP_MODULE).href : 'sharp');
const records = JSON.parse(await fs.readFile('output/imagegen/catalog-completion/prompts.json', 'utf8'));
const slug = value => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
for (const record of records) {
  if (!record.source) throw new Error(`Missing generated source for ${record.id}: ${record.color}`);
  const target = path.join('public/image/catalog', record.type.toLowerCase(), `${slug(record.name)}-${record.id}`, 'raw-v1', `${slug(record.color)}-front.webp`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  if (!process.argv.includes('--replace-generated')) {
    try { await fs.access(target); continue; } catch { /* New asset only. */ }
  }
  await sharp(record.source).webp({ quality: 90 }).toFile(target);
  console.log(target);
}
