import sql from "mssql";
import { getPool } from "../config/db.js";
import { activeProductSql } from "../utils/productLifecycle.js";

function safeJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function cartImage(row) {
  const colorImages = safeJson(row.color_images_json, {});
  const colorGallery = colorImages?.[row.color_name];
  if (Array.isArray(colorGallery) && colorGallery[0]) return colorGallery[0];
  if (typeof colorGallery === "string") return colorGallery;
  return safeJson(row.images_json, [])[0] || "";
}

async function findActiveCartId(executor, customerId, create = false) {
  let result = await executor.request().input("customer_id", sql.NVarChar, customerId)
    .query("SELECT TOP 1 id FROM ShoppingCarts WHERE customer_id=@customer_id AND status='active'");
  if (result.recordset[0] || !create) return result.recordset[0]?.id || null;
  result = await executor.request().input("customer_id", sql.NVarChar, customerId)
    .query("INSERT INTO ShoppingCarts(customer_id) OUTPUT INSERTED.id VALUES(@customer_id)");
  return result.recordset[0].id;
}

async function readCart(pool, customerId) {
  const result = await pool.request().input("customer_id", sql.NVarChar, customerId).query(`
    SELECT ci.id cart_item_id,ci.quantity,p.id product_id,p.product_code,p.name,p.category,p.gender,
           p.description,p.images_json,p.colors_json,p.color_images_json,
           v.id variant_id,v.sku,v.color_name,v.size_name,v.price,v.stock_quantity
    FROM ShoppingCarts c
    JOIN ShoppingCartItems ci ON ci.cart_id=c.id
    JOIN Products p ON p.id=ci.product_id AND ${activeProductSql("p")}
    JOIN ProductVariants v ON v.id=ci.variant_id AND v.product_id=p.id AND v.is_active=1
    WHERE c.customer_id=@customer_id AND c.status='active'
    ORDER BY ci.created_at,ci.id`);
  return result.recordset.map((row) => ({
    id: row.product_id,
    productCode: row.product_code,
    name: row.name,
    category: row.category,
    gender: row.gender,
    description: row.description,
    images: safeJson(row.images_json, []),
    colors: safeJson(row.colors_json, []),
    colorImages: safeJson(row.color_images_json, {}),
    image: cartImage(row),
    quantity: Math.min(row.quantity, row.stock_quantity),
    selectedColor: row.color_name,
    selectedSize: row.size_name,
    variantId: row.variant_id,
    sku: row.sku,
    variantStock: row.stock_quantity,
    stock: row.stock_quantity,
    price: Number(row.price),
    cartItemId: `db-${row.cart_item_id}`,
  })).filter((item) => item.quantity > 0);
}

export async function getCart(req, res) {
  const cart = await readCart(getPool(), req.user.id);
  return res.json({ success: true, cart });
}

export async function saveCart(req, res) {
  const mode = req.body.mode === "merge" ? "merge" : "replace";
  const items = Array.isArray(req.body.items) ? req.body.items.slice(0, 100) : [];
  const pool = getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const cartId = await findActiveCartId(transaction, req.user.id, true);
    if (mode === "replace") {
      await transaction.request().input("cart_id", sql.BigInt, cartId)
        .query("DELETE FROM ShoppingCartItems WHERE cart_id=@cart_id");
    }

    for (const item of items) {
      const quantity = Math.max(1, Math.min(10, Number.parseInt(item.quantity, 10) || 1));
      const productId = Number(item.id || item.productId);
      let variantId = String(item.variantId || "").trim();
      const lookup = transaction.request().input("product_id", sql.Int, productId);
      let variantResult;
      if (variantId) {
        variantResult = await lookup.input("variant_id", sql.NVarChar, variantId).query(`
          SELECT TOP 1 v.id,v.stock_quantity FROM ProductVariants v
          JOIN Products p ON p.id=v.product_id
          WHERE v.id=@variant_id AND v.product_id=@product_id AND v.is_active=1 AND ${activeProductSql("p")}`);
      } else {
        variantResult = await lookup.input("color", sql.NVarChar, String(item.selectedColor || ""))
          .input("size", sql.NVarChar, String(item.selectedSize || "")).query(`
          SELECT TOP 1 v.id,v.stock_quantity FROM ProductVariants v
          JOIN Products p ON p.id=v.product_id
          WHERE v.product_id=@product_id AND v.color_name=@color AND v.size_name=@size
            AND v.is_active=1 AND ${activeProductSql("p")}`);
      }
      const variant = variantResult.recordset[0];
      if (!variant || variant.stock_quantity <= 0) continue;
      variantId = variant.id;
      const acceptedQuantity = quantity;

      if (mode === "merge") {
        await transaction.request().input("cart_id", sql.BigInt, cartId)
          .input("product_id", sql.Int, productId).input("variant_id", sql.NVarChar, variantId)
          .input("quantity", sql.Int, acceptedQuantity).input("stock", sql.Int, variant.stock_quantity).query(`
          MERGE ShoppingCartItems AS target
          USING (SELECT @cart_id cart_id,@variant_id variant_id) AS source
          ON target.cart_id=source.cart_id AND target.variant_id=source.variant_id
          WHEN MATCHED THEN UPDATE SET quantity=CASE WHEN target.quantity+@quantity>10 THEN 10 ELSE target.quantity+@quantity END,updated_at=GETDATE()
          WHEN NOT MATCHED THEN INSERT(cart_id,product_id,variant_id,quantity) VALUES(@cart_id,@product_id,@variant_id,@quantity);`);
      } else {
        await transaction.request().input("cart_id", sql.BigInt, cartId)
          .input("product_id", sql.Int, productId).input("variant_id", sql.NVarChar, variantId)
          .input("quantity", sql.Int, acceptedQuantity).query(`
          INSERT INTO ShoppingCartItems(cart_id,product_id,variant_id,quantity)
          VALUES(@cart_id,@product_id,@variant_id,@quantity)`);
      }
    }
    await transaction.request().input("cart_id", sql.BigInt, cartId)
      .query("UPDATE ShoppingCarts SET updated_at=GETDATE() WHERE id=@cart_id");
    await transaction.commit();
    return res.json({ success: true, cart: await readCart(pool, req.user.id) });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function clearCart(req, res) {
  const pool = getPool();
  await pool.request().input("customer_id", sql.NVarChar, req.user.id).query(`
    DELETE ci FROM ShoppingCartItems ci
    JOIN ShoppingCarts c ON c.id=ci.cart_id
    WHERE c.customer_id=@customer_id AND c.status='active';
    UPDATE ShoppingCarts SET updated_at=GETDATE() WHERE customer_id=@customer_id AND status='active';`);
  return res.json({ success: true, cart: [] });
}
