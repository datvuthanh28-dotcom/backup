import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB, getPool } from "../config/db.js";

const directory = path.dirname(fileURLToPath(import.meta.url));

async function applyInventoryOperationsMigration() {
  await connectDB();
  for (const file of ["029_inventory_operations.sql", "030_inventory_document_workflow.sql"]) {
    const source = fs.readFileSync(path.join(directory, "migrations", file), "utf8");
    for (const batch of source.split(/^\s*GO\s*$/gim)) {
      if (batch.trim()) await getPool().request().query(batch);
    }
  }
  const result = await getPool().request().query(`
    SELECT
      COL_LENGTH('ProductVariants', 'reserved_quantity') AS reserved_quantity,
      COL_LENGTH('ProductVariants', 'quarantine_quantity') AS quarantine_quantity,
      OBJECT_ID('InventoryDocuments') AS inventory_documents,
      OBJECT_ID('InventoryDocumentItems') AS inventory_document_items
  `);
  const state = result.recordset[0];
  if (!state.reserved_quantity || !state.quarantine_quantity || !state.inventory_documents || !state.inventory_document_items) {
    throw new Error("Inventory operations schema verification did not pass.");
  }
  console.log("[Inventory Migration] Reservation, quarantine and warehouse documents are ready.");
  process.exit(0);
}

applyInventoryOperationsMigration().catch((error) => {
  console.error("[Inventory Migration] Failed:", error);
  process.exit(1);
});
