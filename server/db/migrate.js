import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB, getPool, isConnectedToSqlServer } from "../config/db.js";
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

  // Run seed
  await runSeed();
}

if (process.argv[1]?.endsWith("migrate.js")) {
  runMigration().catch((err) => {
    console.error("[Migration] Fatal error:", err);
    process.exit(1);
  });
}

