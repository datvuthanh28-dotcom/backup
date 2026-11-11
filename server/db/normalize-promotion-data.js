import sql from "mssql";
import { connectDB, getPool } from "../config/db.js";

const GENERATED_REFERENCE_PREFIX = "PROMO-NORM-";
const SYNTHETIC_USER_PREFIXES = ["demo_metric_%", "sim_bi_%"];

function hashNumber(value) {
  return [...String(value)].reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0, 2166136261);
}

function daysAgo(days) {
  const value = new Date();
  value.setDate(value.getDate() - days);
  value.setHours(9, 0, 0, 0);
  return value;
}

await connectDB();
const pool = getPool();
const transaction = new sql.Transaction(pool);

try {
  await transaction.begin();
  await transaction.request().query(`
    IF COL_LENGTH('Products','launched_at') IS NULL ALTER TABLE Products ADD launched_at DATETIME2 NULL;
    IF COL_LENGTH('Products','is_classic') IS NULL
      ALTER TABLE Products ADD is_classic BIT NOT NULL CONSTRAINT DF_Products_IsClassic DEFAULT 0;
    IF COL_LENGTH('Products','is_bestseller') IS NULL
      ALTER TABLE Products ADD is_bestseller BIT NOT NULL CONSTRAINT DF_Products_IsBestseller DEFAULT 0;
  `);

  const products = (await transaction.request().query(`
    SELECT p.id,p.name,p.collection_name,
      COALESCE(SUM(CASE WHEN o.recognized_at>=DATEADD(day,-90,GETDATE()) THEN oi.quantity ELSE 0 END),0) sold_90d
    FROM Products p
    LEFT JOIN OrderItems oi ON oi.product_id=p.id
    LEFT JOIN Orders o ON o.id=oi.order_id
    WHERE p.is_active=1
    GROUP BY p.id,p.name,p.collection_name
    ORDER BY p.id
  `)).recordset;

  const bestsellerLimit = Math.max(5, Math.ceil(products.length * 0.08));
  const bestsellerIds = new Set(
    [...products]
      .filter((product) => Number(product.sold_90d) >= 3)
      .sort((a, b) => Number(b.sold_90d) - Number(a.sold_90d) || a.id - b.id)
      .slice(0, bestsellerLimit)
      .map((product) => product.id)
  );

  let classicCount = 0;
  let newCount = 0;
  for (let index = 0; index < products.length; index += 1) {
    const product = products[index];
    const text = `${product.name || ""} ${product.collection_name || ""}`.toLowerCase();
    const isClassic = text.includes("classic");
    const isBestseller = bestsellerIds.has(product.id);
    const seed = hashNumber(product.id);
    const launchAge = isClassic || isBestseller
      ? 240 + (seed % 420)
      : index % 13 === 0
        ? 15 + (seed % 41)
        : 90 + (seed % 541);
    if (isClassic) classicCount += 1;
    if (launchAge <= 60) newCount += 1;

    await transaction.request()
      .input("id", sql.Int, product.id)
      .input("launched", sql.DateTime2, daysAgo(launchAge))
      .input("classic", sql.Bit, isClassic)
      .input("bestseller", sql.Bit, isBestseller)
      .query(`UPDATE Products SET launched_at=@launched,is_classic=@classic,is_bestseller=@bestseller WHERE id=@id`);
  }

  const variants = (await transaction.request().query(`
    SELECT v.id,v.product_id,v.sku,v.stock_quantity,v.low_stock_threshold,v.max_stock_threshold,
      COALESCE(s.sold_60d,0) sold_60d
    FROM ProductVariants v
    JOIN Products p ON p.id=v.product_id AND p.is_active=1
    OUTER APPLY (
      SELECT SUM(oi.quantity) sold_60d
      FROM OrderItems oi JOIN Orders o ON o.id=oi.order_id
      WHERE oi.variant_id=v.id AND o.recognized_at>=DATEADD(day,-60,GETDATE())
    ) s
    WHERE v.is_active=1
    ORDER BY v.id
  `)).recordset;

  await transaction.request()
    .input("prefix", sql.NVarChar, `${GENERATED_REFERENCE_PREFIX}%`)
    .query("DELETE FROM InventoryMovements WHERE reference_id LIKE @prefix");

  let movementCount = 0;
  for (const variant of variants) {
    const stock = Number(variant.stock_quantity || 0);
    if (stock <= 0) continue;
    const min = Number(variant.low_stock_threshold || 0);
    const max = Number(variant.max_stock_threshold || 0);
    const sold = Number(variant.sold_60d || 0);
    const seed = hashNumber(variant.id);
    let ageDays;
    if (max > 0 && stock >= max) ageDays = seed % 5 === 0 ? 35 + (seed % 41) : 120 + (seed % 181);
    else if (stock <= min) ageDays = 15 + (seed % 61);
    else if (sold === 0) ageDays = seed % 4 === 0 ? 25 + (seed % 51) : 90 + (seed % 151);
    else ageDays = 30 + (seed % 121);

    await transaction.request()
      .input("product", sql.Int, variant.product_id)
      .input("variant", sql.NVarChar, variant.id)
      .input("stock", sql.Int, stock)
      .input("reference", sql.NVarChar, `${GENERATED_REFERENCE_PREFIX}${variant.id}`)
      .input("created", sql.DateTime2, daysAgo(ageDays))
      .query(`
        INSERT INTO InventoryMovements(product_id,variant_id,movement_type,quantity_change,resulting_stock,
          reference_id,note,performed_by,created_at)
        VALUES(@product,@variant,'initial_stock',@stock,@stock,@reference,
          N'[DỮ LIỆU MÔ PHỎNG] Lô nhập dùng cho phân tích tuổi tồn kho','promotion_data_seed',@created)
      `);
    movementCount += 1;
  }

  // Replace only synthetic engagement. Real customer favorites remain untouched.
  for (const prefix of SYNTHETIC_USER_PREFIXES) {
    await transaction.request().input("prefix", sql.NVarChar, prefix).query(`
      DELETE FROM ProductFavoriteEvents WHERE user_id LIKE @prefix;
      DELETE FROM ProductFavorites WHERE user_id LIKE @prefix;
    `);
  }

  const syntheticUsers = (await transaction.request().query(`
    SELECT id FROM Users
    WHERE is_active=1 AND role='customer' AND (id LIKE 'demo_metric_%' OR id LIKE 'sim_bi_%')
    ORDER BY id
  `)).recordset.map((row) => row.id);
  if (syntheticUsers.length < 10) throw new Error("Cần chạy dữ liệu khách hàng mô phỏng trước khi chuẩn hóa tín hiệu khuyến mãi.");

  const buyers = (await transaction.request().query(`
    SELECT DISTINCT oi.product_id,o.customer_id
    FROM Orders o JOIN OrderItems oi ON oi.order_id=o.id
    WHERE o.recognized_at IS NOT NULL
      AND (o.customer_id LIKE 'demo_metric_%' OR o.customer_id LIKE 'sim_bi_%')
  `)).recordset;
  const buyersByProduct = new Map();
  for (const buyer of buyers) {
    const list = buyersByProduct.get(buyer.product_id) || [];
    list.push(buyer.customer_id);
    buyersByProduct.set(buyer.product_id, list);
  }

  let favoriteCount = 0;
  for (let index = 0; index < products.length; index += 1) {
    const product = products[index];
    const seed = hashNumber(`favorite-${product.id}`);
    const segment = index % 10;
    // Only a small catalogue segment has strong wishlist demand. Most products
    // intentionally remain below the five-favorite scoring threshold.
    const targetFavorites = segment <= 1 ? 14 + (seed % 9)
      : segment === 2 ? 8 + (seed % 7)
        : seed % 5;
    const availableBuyers = [...new Set(buyersByProduct.get(product.id) || [])];
    const desiredBuyerCount = segment <= 1 ? Math.min(1, availableBuyers.length)
      : segment === 2 ? Math.min(Math.max(2, Math.round(targetFavorites * 0.55)), availableBuyers.length)
        : Math.min(availableBuyers.length, Math.round(targetFavorites * 0.25));
    const selected = availableBuyers.slice(0, desiredBuyerCount);
    const offset = seed % syntheticUsers.length;
    for (let cursor = 0; selected.length < targetFavorites && cursor < syntheticUsers.length * 2; cursor += 1) {
      const candidate = syntheticUsers[(offset + cursor * 7) % syntheticUsers.length];
      if (!selected.includes(candidate)) selected.push(candidate);
    }

    for (let favoriteIndex = 0; favoriteIndex < selected.length; favoriteIndex += 1) {
      const user = selected[favoriteIndex];
      const eventAge = 3 + ((seed + favoriteIndex * 11) % 118);
      await transaction.request()
        .input("user", sql.NVarChar, user)
        .input("product", sql.Int, product.id)
        .input("created", sql.DateTime2, daysAgo(eventAge))
        .query(`
          INSERT INTO ProductFavorites(user_id,product_id,is_active,created_at,updated_at)
          VALUES(@user,@product,1,@created,@created);
          INSERT INTO ProductFavoriteEvents(user_id,product_id,event_type,created_at)
          VALUES(@user,@product,'added',@created);
        `);
      favoriteCount += 1;
    }
  }

  await transaction.commit();
  console.log(JSON.stringify({
    products: products.length,
    variantsWithStockAge: movementCount,
    favorites: favoriteCount,
    classicProducts: classicCount,
    bestsellerProducts: bestsellerIds.size,
    newProducts: newCount,
  }, null, 2));
  console.log("Dữ liệu mô phỏng đã được ghi vào MSSQL; dữ liệu người dùng thật được giữ nguyên.");
} catch (error) {
  if (transaction._aborted !== true) await transaction.rollback();
  console.error("Không thể chuẩn hóa dữ liệu khuyến mãi:", error);
  process.exitCode = 1;
} finally {
  await pool.close();
}

