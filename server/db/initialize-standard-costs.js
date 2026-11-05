import sql from "mssql";
import { connectDB, db } from "../config/db.js";

const MINIMUM_GROSS_MARGIN = 0.30;

const COST_RATIOS = new Map([
  ["shirts", 0.35],
  ["tops & shirts", 0.35],
  ["trousers", 0.38],
  ["trousers & skirts", 0.38],
  ["knitwear", 0.42],
  ["outerwear", 0.45],
  ["dresses", 0.40],
  ["shoes", 0.43],
  ["bags", 0.45],
  ["bags & small leather goods", 0.45],
  ["belts", 0.40],
  ["wallets & small leather goods", 0.40],
  ["eyewear", 0.35],
  ["hats", 0.38],
  ["scarves", 0.38],
  ["baby clothing", 0.38],
  ["boys clothing", 0.38],
  ["girls clothing", 0.38],
  ["toys", 0.40],
]);

const roundToTenThousand = (value) => Math.round(Number(value) / 10000) * 10000;
const ceilToTenThousand = (value) => Math.ceil(Number(value) / 10000) * 10000;

function ratioFor(product) {
  const subcategory = String(product.subcategory || "").trim().toLowerCase();
  if (COST_RATIOS.has(subcategory)) return COST_RATIOS.get(subcategory);
  if (product.category === "footwear") return 0.43;
  if (product.category === "accessories") return 0.40;
  return 0.40;
}

export async function initializeStandardCosts() {
  const pool = await connectDB();
  const products = await db.getAllProducts();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  let updatedCosts = 0;
  let updatedFloors = 0;
  try {
    for (const product of products) {
      const ratio = ratioFor(product);
      for (const variant of product.variants || []) {
        const sellingPrice = Number(variant.price || product.price || 0);
        if (!sellingPrice) continue;
        const proposedCost = Math.min(sellingPrice, roundToTenThousand(sellingPrice * ratio));
        const proposedFloor = Math.min(sellingPrice, ceilToTenThousand(proposedCost / (1 - MINIMUM_GROSS_MARGIN)));
        const result = await new sql.Request(transaction)
          .input("id", sql.NVarChar, variant.id)
          .input("cost", sql.Decimal(18, 0), proposedCost)
          .input("floor", sql.Decimal(18, 0), proposedFloor)
          .query(`
            UPDATE ProductVariants
            SET cost_price = CASE WHEN cost_price IS NULL OR cost_price = 0 THEN @cost ELSE cost_price END,
                floor_price = CASE WHEN floor_price IS NULL OR floor_price = 0 OR floor_price < @floor THEN @floor ELSE floor_price END,
                updated_at = GETDATE()
            OUTPUT deleted.cost_price old_cost, inserted.cost_price new_cost,
                   deleted.floor_price old_floor, inserted.floor_price new_floor
            WHERE id = @id;
          `);
        const row = result.recordset[0];
        if (row && Number(row.old_cost || 0) === 0 && Number(row.new_cost || 0) > 0) updatedCosts += 1;
        if (row && Number(row.old_floor || 0) === 0 && Number(row.new_floor || 0) > 0) updatedFloors += 1;
      }
    }

    // This is the one-time opening cost basis for legacy/demo rows that never
    // had a cost snapshot. Existing non-null snapshots are immutable.
    await new sql.Request(transaction).query(`
      UPDATE oi
      SET unit_cost_snapshot = pv.cost_price
      FROM OrderItems oi
      JOIN ProductVariants pv ON pv.id = oi.variant_id
      WHERE oi.unit_cost_snapshot IS NULL AND pv.cost_price IS NOT NULL;
    `);
    await transaction.commit();
    return { updatedCosts, updatedFloors, minimumGrossMargin: MINIMUM_GROSS_MARGIN };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

if (process.argv[1]?.endsWith("initialize-standard-costs.js")) {
  initializeStandardCosts()
    .then((summary) => { console.log("[Cost Initialization]", summary); process.exit(0); })
    .catch((error) => { console.error("[Cost Initialization] Failed:", error); process.exit(1); });
}
