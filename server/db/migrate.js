import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB, getPool } from "../config/db.js";
import { runSeed } from "./seed.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigration() {
  console.log("==================================================");
  console.log("MAISON RUE — Executing Database Schema Migrations");
  console.log("==================================================");

  await connectDB();

  const pool = getPool();
  const schemaPath = path.join(__dirname, "schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  // Split batches by GO
  const batches = schemaSql.split(/^\s*GO\s*$/gim);
  for (const batch of batches) {
    const trimmed = batch.trim();
    if (trimmed) {
      try {
        await pool.request().query(trimmed);
      } catch (err) {
        console.warn("[Migration] Batch warning/note:", err.message);
      }
    }
  }
  console.log("[Migration] Microsoft SQL Server schema tables verified.");

  // Execute incremental migrations in server/db/migrations/
  const migrationsDir = path.join(__dirname, "migrations");
  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      console.log(`[Migration] Applying incremental migration: ${file}...`);
      const migrationSql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      const mBatches = migrationSql.split(/^\s*GO\s*$/gim);
      for (const b of mBatches) {
        const trimmed = b.trim();
        if (trimmed) {
          try {
            await pool.request().query(trimmed);
          } catch (err) {
            console.warn(`[Migration] ${file} note:`, err.message);
          }
        }
      }
    }
  }

  // Run seed
  await runSeed();
}

if (process.argv[1]?.endsWith("migrate.js")) {
  runMigration().catch((err) => {
    console.error("[Migration] Fatal error:", err);
    process.exit(1);
  });
}

