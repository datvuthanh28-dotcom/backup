import { connectDB } from "../config/db.js";
import { allProducts } from "../../src/data/products.js";

const pool = await connectDB();
try {
  const tx = await pool.transaction();
  await tx.begin();
  try {
    await tx.request().query("UPDATE ProductVariants SET is_active = 0, updated_at = GETDATE(); UPDATE Products SET is_active = 0, updated_at = GETDATE();");
    for (const product of allProducts) {
      const productCode = `MR-${String(product.id).padStart(3, "0")}`;
      const req = tx.request()
        .input("id", product.id)
        .input("product_code", productCode)
        .input("name", product.name)
        .input("price", product.price)
        .input("category", product.category)
        .input("gender", product.gender)
        .input("images_json", JSON.stringify(product.images))
        .input("colors_json", JSON.stringify(product.colors))
        .input("color_images_json", JSON.stringify(product.colorImages))
        .input("description", product.description);
      await req.query(`
        IF EXISTS (SELECT 1 FROM Products WHERE id=@id)
          UPDATE Products SET product_code=@product_code, name=@name, price=@price, category=@category, gender=@gender,
            images_json=@images_json, colors_json=@colors_json, color_images_json=@color_images_json,
            description=@description, is_active=1, updated_at=GETDATE() WHERE id=@id;
        ELSE
          INSERT INTO Products (id, product_code, name, price, category, gender, images_json, colors_json, color_images_json, description, stock, min_alert, is_active, created_at, updated_at)
          VALUES (@id, @product_code, @name, @price, @category, @gender, @images_json, @colors_json, @color_images_json, @description, 0, 5, 1, GETDATE(), GETDATE());
      `);
      for (const variant of product.variants) {
        await tx.request()
          .input("id", variant.id)
          .input("product_id", product.id)
          .input("sku", variant.sku)
          .input("color_name", variant.color)
          .input("size_name", variant.size)
          .input("price", variant.price)
          .query(`
            MERGE ProductVariants AS target
            USING (SELECT @product_id AS product_id, @color_name AS color_name, @size_name AS size_name) AS source
              ON target.product_id=source.product_id AND target.color_name=source.color_name AND target.size_name=source.size_name
            WHEN MATCHED THEN UPDATE SET sku=@sku, price=@price, is_active=1, updated_at=GETDATE()
            WHEN NOT MATCHED THEN INSERT (id, product_id, sku, color_name, size_name, price, stock_quantity, low_stock_threshold, max_stock_threshold, is_active)
              VALUES (@id, @product_id, @sku, @color_name, @size_name, @price, 0, 3, 20, 1);
          `);
      }
    }
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
  console.log(`Catalog ready: ${allProducts.length} products, ${allProducts.reduce((n, p) => n + p.variants.length, 0)} variants.`);
} finally {
  await pool.close();
}
