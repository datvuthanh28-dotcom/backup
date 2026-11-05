import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB, getPool } from "../config/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function applyCartMigration() {
  await connectDB();
  const sqlText = fs.readFileSync(path.join(__dirname, "migrations", "016_customer_shopping_cart.sql"), "utf8");
  for (const batch of sqlText.split(/^\s*GO\s*$/gim)) {
    if (batch.trim()) await getPool().request().query(batch);
  }
  const verification = await getPool().request().query(`
    SELECT OBJECT_ID('ShoppingCarts') shopping_carts,
           OBJECT_ID('ShoppingCartItems') shopping_cart_items,
           (SELECT COUNT(1) FROM sys.indexes WHERE name='UX_ShoppingCarts_ActiveCustomer') active_cart_unique_index`);
  const state = verification.recordset[0];
  if (!state.shopping_carts || !state.shopping_cart_items || state.active_cart_unique_index !== 1) {
    throw new Error("Cart schema verification did not pass.");
  }
  console.log("[Cart Migration] ShoppingCarts, ShoppingCartItems and ownership index are ready.");
  process.exit(0);
}

applyCartMigration().catch((error) => {
  console.error("[Cart Migration] Failed:", error);
  process.exit(1);
});
