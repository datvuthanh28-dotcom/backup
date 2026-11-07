import sql from "mssql";
import { connectDB } from "../config/db.js";
import { allProducts } from "../../src/data/products.js";
import generatedCatalogMedia from "../../src/data/catalog-media.json" with { type: "json" };

const productIds = new Set(Object.keys(generatedCatalogMedia).map(Number));
const products = allProducts.filter((product) => productIds.has(product.id));
const pool = await connectDB();

try {
  const transaction = pool.transaction();
  await transaction.begin();
  try {
    for (const product of products) {
      await transaction.request()
        .input("id", sql.Int, product.id)
        .input("images_json", sql.NVarChar(sql.MAX), JSON.stringify(product.images))
        .input("color_images_json", sql.NVarChar(sql.MAX), JSON.stringify(product.colorImages))
        .query(`
          UPDATE Products
          SET images_json = @images_json,
              color_images_json = @color_images_json,
              updated_at = GETDATE()
          WHERE id = @id;
        `);
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
  console.log(`Synchronized catalog media for ${products.length} product(s).`);
} finally {
  await pool.close();
}
