import { connectDB, db } from "../config/db.js";
import { allProducts } from "../../src/data/products.js";

const pool = await connectDB();
await pool.request().query("UPDATE ProductVariants SET is_active = 0, updated_at = GETDATE()");

for (const product of allProducts) {
  const existing = await db.getProductById(product.id);
  const request = pool.request()
    .input("id", product.id)
    .input("name", product.name)
    .input("price", product.price)
    .input("category", product.productType.toLowerCase())
    .input("gender", product.gender)
    .input("images_json", JSON.stringify(product.images))
    .input("colors_json", JSON.stringify(product.colors))
    .input("color_images_json", JSON.stringify(product.colorImages))
    .input("description", product.description)
    .input("stock", product.stock)
    .input("min_alert", 5);
  if (existing) {
    await request.query(`
      UPDATE Products SET name=@name, price=@price, category=@category, gender=@gender,
        images_json=@images_json, colors_json=@colors_json, color_images_json=@color_images_json,
        description=@description, updated_at=GETDATE()
      WHERE id=@id
    `);
  } else {
    await request.query(`
      INSERT INTO Products (id, name, price, category, gender, images_json, colors_json, color_images_json, description, stock, min_alert, created_at, updated_at)
      VALUES (@id, @name, @price, @category, @gender, @images_json, @colors_json, @color_images_json, @description, @stock, @min_alert, GETDATE(), GETDATE())
    `);
  }

  for (const variant of product.variants) {
    const stableVariantId = `v-${product.id}-${variant.color.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${variant.size.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    await pool.request()
      .input("id", stableVariantId)
      .input("product_id", product.id)
      .input("sku", variant.sku)
      .input("color_name", variant.color)
      .input("size_name", variant.size)
      .input("price", variant.price)
      .input("stock_quantity", variant.stock)
      .query(`
        MERGE ProductVariants AS target
        USING (SELECT @product_id AS product_id, @color_name AS color_name, @size_name AS size_name) AS source
          ON target.product_id=source.product_id AND target.color_name=source.color_name AND target.size_name=source.size_name
        WHEN MATCHED THEN UPDATE SET sku=@sku, color_name=@color_name, size_name=@size_name, price=@price, is_active=1, updated_at=GETDATE()
        WHEN NOT MATCHED THEN INSERT (id, product_id, sku, color_name, size_name, price, stock_quantity, low_stock_threshold, is_active)
          VALUES (@id, @product_id, @sku, @color_name, @size_name, @price, @stock_quantity, 3, 1);
      `);
  }
}

console.log(`Catalog ready: ${allProducts.length} products, no orders created.`);
await pool.close();
