import sql from "mssql";
import dotenv from "dotenv";
import { allProducts as catalogProducts } from "../../src/data/products.js";
import { activeProductSql, isLegacyProductCode, legacyProductSql } from "../utils/productLifecycle.js";

// The repository treats the project-local .env as the development source of
// truth. This avoids an unrelated Windows-level DB_PORT/DB_NAME variable from
// silently pointing one developer at a different SQL Server database.
dotenv.config({ override: true });

const sqlConfig = {
  user: process.env.DB_USER || "sa",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "MaisonRueDB",
  server: process.env.DB_SERVER || "localhost",
  port: parseInt(process.env.DB_PORT, 10) || 1433,
  pool: {
    max: 15,
    min: 1,
    idleTimeoutMillis: 30000,
  },
  options: {
    encrypt: process.env.DB_ENCRYPT === "true",
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== "false",
  },
};

let pool = null;
let isSqlServerConnected = false;

export async function connectDB() {
  if (!sqlConfig.password) {
    throw new Error("[Database Error] DB_PASSWORD is missing. Configure it in your local .env file.");
  }
  if (pool && isSqlServerConnected) {
    return pool;
  }

  try {
    pool = await sql.connect(sqlConfig);
    isSqlServerConnected = true;
    console.log(
      `[Database] Successfully connected to Microsoft SQL Server: ${sqlConfig.database} at ${sqlConfig.server}:${sqlConfig.port}`
    );
    return pool;
  } catch (err) {
    isSqlServerConnected = false;
    pool = null;
    const errorMsg = `[Database Error] Microsoft SQL Server (${sqlConfig.server}:${sqlConfig.port}/${sqlConfig.database}) is unavailable: ${err.message}`;
    console.error(errorMsg);
    throw new Error(errorMsg, { cause: err });
  }
}

export function isConnectedToSqlServer() {
  return isSqlServerConnected && pool !== null;
}

export function getPool() {
  if (!pool || !isSqlServerConnected) {
    throw new Error("[Database Error] Microsoft SQL Server connection pool is not established. Please check server connection.");
  }
  return pool;
}

async function getActivePool() {
  if (!pool || !isSqlServerConnected) {
    return await connectDB();
  }
  return pool;
}

const COLOR_NAME_PATTERN = /^[\p{L}][\p{L}\p{M}\s-]{0,39}$/u;
const ALPHA_SIZES = new Set(["XXS", "XS", "S", "SMALL", "M", "MEDIUM", "L", "LARGE", "XL", "X-LARGE", "XXL", "2XL", "3XL", "4XL"]);

function validateCatalogColor(color) {
  const normalized = String(color || "").trim().replace(/\s+/g, " ");
  if (!COLOR_NAME_PATTERN.test(normalized)) {
    throw new Error(`Màu “${normalized || "trống"}” không hợp lệ. Chỉ dùng chữ, khoảng trắng hoặc dấu gạch nối.`);
  }
  return normalized;
}

function validateCatalogSize(size, category) {
  const normalized = String(size || "").trim().replace(/\s+/g, " ").toUpperCase();
  if (category === "accessories") {
    const numericSize = Number(normalized);
    const isLengthSize = /^\d{2,3}$/.test(normalized) && numericSize >= 50 && numericSize <= 130;
    if (normalized !== "ONE SIZE" && !ALPHA_SIZES.has(normalized) && !isLengthSize) {
      throw new Error(`Size phụ kiện “${normalized || "trống"}” không hợp lệ.`);
    }
    return normalized;
  }
  if (category === "footwear") {
    const numericSize = Number(normalized);
    if (!/^\d{2}(?:\.5)?$/.test(normalized) || numericSize < 16 || numericSize > 48) {
      throw new Error(`Cỡ giày “${normalized || "trống"}” không hợp lệ. Chấp nhận cỡ số từ 16 đến 48, có thể có .5.`);
    }
    return normalized;
  }
  const numericSize = Number(normalized);
  const isNumericClothingSize = /^\d{2}$/.test(normalized) && numericSize >= 18 && numericSize <= 54;
  const ageMatch = normalized.match(/^(\d{1,2})-(\d{1,2})(M|Y)$/);
  const isAgeSize = Boolean(ageMatch) && Number(ageMatch[1]) < Number(ageMatch[2]) && Number(ageMatch[2]) <= (ageMatch[3] === "M" ? 24 : 16);
  if (!ALPHA_SIZES.has(normalized) && !isNumericClothingSize && !isAgeSize) {
    throw new Error(`Size “${normalized || "trống"}” không đúng chuẩn trang phục.`);
  }
  return normalized;
}

// Returned merchandise becomes sellable only after physical inspection passes.
// The caller owns the SQL transaction, so stock changes roll back with a failed
// refund or replacement dispatch instead of leaving a partial inventory update.
async function restoreReturnedInventory(transaction, returnRequest, performedBy, referenceId, movementType, supplied = {}) {
  let item = supplied.item;
  if (!item) {
    const itemResult = await transaction.request().input("id", sql.Int, returnRequest.order_item_id)
      .query("SELECT id,product_id,variant_id,variant_sku,selected_color,selected_size,quantity FROM OrderItems WITH (UPDLOCK,ROWLOCK) WHERE id=@id");
    item = itemResult.recordset[0];
  }
  const quantity = Number(returnRequest.requested_quantity || 0);
  if (!item || !Number.isInteger(quantity) || quantity < 1 || quantity > Number(item.quantity)) {
    throw new Error("The approved return quantity is invalid.");
  }

  let originalVariant = supplied.originalVariant;
  if (!originalVariant) {
    const variantResult = await transaction.request()
      .input("product_id", sql.Int, item.product_id)
      .input("variant_id", sql.NVarChar, item.variant_id || null)
      .input("color", sql.NVarChar, item.selected_color)
      .input("size", sql.NVarChar, item.selected_size)
      .query(`SELECT id,product_id,sku,color_name,size_name,stock_quantity,is_active
        FROM ProductVariants WITH (UPDLOCK,HOLDLOCK)
        WHERE product_id=@product_id
          AND ((@variant_id IS NOT NULL AND id=@variant_id)
            OR (@variant_id IS NULL AND color_name=@color AND size_name=@size))`);
    originalVariant = variantResult.recordset[0];
  }
  if (!originalVariant) {
    throw new Error("The original SKU could not be found for this returned item. Please correct inventory manually before completing the request.");
  }

  const variantUpdate = await transaction.request()
    .input("variant_id", sql.NVarChar, originalVariant.id)
    .input("qty", sql.Int, quantity)
    .query("UPDATE ProductVariants SET stock_quantity=stock_quantity+@qty,updated_at=GETDATE() WHERE id=@variant_id; SELECT stock_quantity FROM ProductVariants WHERE id=@variant_id;");
  const resultingVariantStock = Number(variantUpdate.recordset[0].stock_quantity);
  const productUpdate = await transaction.request()
    .input("product_id", sql.Int, item.product_id)
    .input("qty", sql.Int, quantity)
    .query("UPDATE Products SET stock=stock+@qty,updated_at=GETDATE() WHERE id=@product_id; SELECT stock FROM Products WHERE id=@product_id;");
  if (!productUpdate.recordset[0]) throw new Error("The returned item's product could not be found in inventory.");
  const resultingProductStock = Number(productUpdate.recordset[0].stock);
  await transaction.request()
    .input("product_id", sql.Int, item.product_id)
    .input("variant_id", sql.NVarChar, originalVariant.id)
    .input("movement_type", sql.NVarChar, movementType)
    .input("quantity_change", sql.Int, quantity)
    .input("resulting_stock", sql.Int, resultingProductStock)
    .input("reference_id", sql.NVarChar, referenceId)
    .input("note", sql.NVarChar, `Physical return accepted for ${referenceId}: ${originalVariant.sku} (${originalVariant.color_name} / ${originalVariant.size_name}); variant stock after receipt: ${resultingVariantStock}`)
    .input("performed_by", sql.NVarChar, performedBy)
    .query(`INSERT INTO InventoryMovements(product_id,variant_id,movement_type,quantity_change,resulting_stock,reference_id,note,performed_by,created_at)
      VALUES(@product_id,@variant_id,@movement_type,@quantity_change,@resulting_stock,@reference_id,@note,@performed_by,GETDATE())`);
  return { item, originalVariant, quantity, resultingVariantStock, resultingProductStock };
}

// Authoritative Database Query Adapter (Strictly Microsoft SQL Server)
export const db = {
  isSqlServer: () => true,

  // ==========================================
  // USERS TABLE
  // ==========================================
  async findUserByEmail(email) {
    const p = await getActivePool();
    const trimmed = (email || "").trim().toLowerCase();
    const res = await p
      .request()
      .input("email", sql.NVarChar, trimmed)
      .query("SELECT * FROM Users WHERE LOWER(email) = @email");
    return res.recordset[0] || null;
  },

  async findUserById(id) {
    const p = await getActivePool();
    const res = await p
      .request()
      .input("id", sql.NVarChar, id)
      .query("SELECT * FROM Users WHERE id = @id");
    return res.recordset[0] || null;
  },

  async createUser(user) {
    const p = await getActivePool();
    await p
      .request()
      .input("id", sql.NVarChar, user.id)
      .input("name", sql.NVarChar, user.name)
      .input("email", sql.NVarChar, user.email.toLowerCase())
      .input("password_hash", sql.NVarChar, user.password_hash)
      .input("role", sql.NVarChar, user.role)
      .input("phone", sql.NVarChar, user.phone || null)
      .input("is_active", sql.Bit, user.is_active !== false ? 1 : 0)
      .query(`
        INSERT INTO Users (id, name, email, password_hash, role, phone, is_active, created_at, updated_at)
        VALUES (@id, @name, @email, @password_hash, @role, @phone, @is_active, GETDATE(), GETDATE())
      `);
    return user;
  },

  async getAllStaff() {
    const p = await getActivePool();
    const res = await p
      .request()
      .query(
        "SELECT id, name, email, role, phone, is_active, created_at, updated_at FROM Users WHERE role = 'staff' ORDER BY created_at DESC"
      );
    return res.recordset;
  },

  async updateUser(id, fields) {
    const p = await getActivePool();
    const req = p.request().input("id", sql.NVarChar, id);
    const updates = [];
    if (fields.name !== undefined) {
      req.input("name", sql.NVarChar, fields.name);
      updates.push("name = @name");
    }
    if (fields.phone !== undefined) {
      req.input("phone", sql.NVarChar, fields.phone);
      updates.push("phone = @phone");
    }
    if (fields.password_hash !== undefined) {
      req.input("password_hash", sql.NVarChar, fields.password_hash);
      updates.push("password_hash = @password_hash");
      updates.push("token_version = ISNULL(token_version, 1) + 1");
    }
    if (fields.is_active !== undefined) {
      req.input("is_active", sql.Bit, fields.is_active ? 1 : 0);
      updates.push("is_active = @is_active");
      if (!fields.is_active) {
        updates.push("token_version = ISNULL(token_version, 1) + 1");
      }
    }
    if (updates.length > 0) {
      updates.push("updated_at = GETDATE()");
      await req.query(`UPDATE Users SET ${updates.join(", ")} WHERE id = @id`);
    }
    return this.findUserById(id);
  },

  // ==========================================
  // PRODUCTS TABLE
  // ==========================================
  async getAllProducts() {
    const p = await getActivePool();
    const res = await p.request().query(`SELECT p.* FROM Products p WHERE ${activeProductSql("p")} ORDER BY p.id ASC`);
    const variantRes = await p.request().query(`
      SELECT pv.*,
             latest.created_at AS last_inventory_activity_at,
             latest.movement_type AS last_inventory_movement_type,
             latest.quantity_change AS last_inventory_change,
             latest.performed_by AS last_inventory_actor
      FROM ProductVariants pv
      OUTER APPLY (
        SELECT TOP (1) im.created_at, im.movement_type, im.quantity_change, im.performed_by
        FROM InventoryMovements im
        WHERE im.variant_id = pv.id
        ORDER BY im.created_at DESC, im.id DESC
      ) latest
      WHERE pv.is_active = 1
      ORDER BY pv.product_id, pv.color_name, pv.size_name
    `);
    return res.recordset.map((r) => {
      const catalog = catalogProducts.find((product) => product.id === r.id) || {};
      const variants = variantRes.recordset.filter((variant) => variant.product_id === r.id).map((variant) => ({
        id: variant.id, sku: variant.sku, color: variant.color_name, size: variant.size_name,
        price: Number(variant.price), costPrice: Number(variant.cost_price || 0), floorPrice: Number(variant.floor_price || 0),
        stock: Number(variant.stock_quantity || 0),
        reservedQuantity: Number(variant.reserved_quantity || 0),
        quarantineQuantity: Number(variant.quarantine_quantity || 0),
        incomingQuantity: Number(variant.incoming_quantity || 0),
        availableQuantity: Math.max(0, Number(variant.stock_quantity || 0) - Number(variant.reserved_quantity || 0) - Number(variant.quarantine_quantity || 0)),
        reorderPoint: Number(variant.reorder_point ?? variant.low_stock_threshold ?? 0),
        leadTimeDays: Number(variant.lead_time_days || 7),
        lowStockThreshold: variant.low_stock_threshold, maxStockThreshold: variant.max_stock_threshold,
        lastInventoryActivityAt: variant.last_inventory_activity_at,
        lastInventoryMovementType: variant.last_inventory_movement_type,
        lastInventoryChange: variant.last_inventory_change == null ? null : Number(variant.last_inventory_change),
        lastInventoryActor: variant.last_inventory_actor,
      }))
        .sort((a, b) => (catalog.colors?.indexOf(a.color) ?? 0) - (catalog.colors?.indexOf(b.color) ?? 0) || (catalog.sizes?.indexOf(a.size) ?? 0) - (catalog.sizes?.indexOf(b.size) ?? 0));
      return { ...catalog, ...r, productCode: r.product_code, collection: r.collection_name || catalog.collection, collections: r.collections_json ? JSON.parse(r.collections_json) : catalog.collections, material: r.material || catalog.material, stock: variants.reduce((sum, variant) => sum + variant.stock, 0), variants, images: JSON.parse(r.images_json), colors: JSON.parse(r.colors_json), colorImages: JSON.parse(r.color_images_json) };
    });
  },

  async getProductById(id) {
    const p = await getActivePool();
    const numId = Number(id);
    const res = await p
      .request()
      .input("id", sql.Int, numId)
      .query(`SELECT p.* FROM Products p WHERE p.id = @id AND ${activeProductSql("p")}`);
    const r = res.recordset[0];
    if (!r) return null;
    const catalog = catalogProducts.find((product) => product.id === r.id) || {};
    const variantRes = await p.request().input("product_id", sql.Int, numId).query(`
      SELECT pv.*,
             latest.created_at AS last_inventory_activity_at,
             latest.movement_type AS last_inventory_movement_type,
             latest.quantity_change AS last_inventory_change,
             latest.performed_by AS last_inventory_actor
      FROM ProductVariants pv
      OUTER APPLY (
        SELECT TOP (1) im.created_at, im.movement_type, im.quantity_change, im.performed_by
        FROM InventoryMovements im
        WHERE im.variant_id = pv.id
        ORDER BY im.created_at DESC, im.id DESC
      ) latest
      WHERE pv.product_id=@product_id AND pv.is_active=1
      ORDER BY pv.color_name, pv.size_name
    `);
    const variants = variantRes.recordset.map((variant) => ({ id: variant.id, sku: variant.sku, color: variant.color_name, size: variant.size_name, price: Number(variant.price), costPrice: Number(variant.cost_price || 0), floorPrice: Number(variant.floor_price || 0), stock: variant.stock_quantity, lowStockThreshold: variant.low_stock_threshold, maxStockThreshold: variant.max_stock_threshold, lastInventoryActivityAt: variant.last_inventory_activity_at, lastInventoryMovementType: variant.last_inventory_movement_type, lastInventoryChange: variant.last_inventory_change == null ? null : Number(variant.last_inventory_change), lastInventoryActor: variant.last_inventory_actor }))
      .sort((a, b) => (catalog.colors?.indexOf(a.color) ?? 0) - (catalog.colors?.indexOf(b.color) ?? 0) || (catalog.sizes?.indexOf(a.size) ?? 0) - (catalog.sizes?.indexOf(b.size) ?? 0));
    return {
      ...catalog, ...r,
      productCode: r.product_code,
      collection: r.collection_name || catalog.collection,
      collections: r.collections_json ? JSON.parse(r.collections_json) : catalog.collections,
      material: r.material || catalog.material,
      stock: variants.reduce((sum, variant) => sum + variant.stock, 0),
      variants,
      images: JSON.parse(r.images_json),
      colors: JSON.parse(r.colors_json),
      colorImages: JSON.parse(r.color_images_json),
    };
  },

  async updateProductStock(id, newStock, performedBy = "Staff", note = "Manual stock update") {
    const p = await getActivePool();
    const numId = Number(id);
    const parsedStock = Math.max(0, parseInt(newStock, 10));

    const transaction = new sql.Transaction(p);
    await transaction.begin();
    try {
      const prodRes = await transaction
        .request()
        .input("id", sql.Int, numId)
        .query(`SELECT p.id, p.stock, p.product_code FROM Products p WHERE p.id = @id AND ${activeProductSql("p")}`);
      const product = prodRes.recordset[0];
      if (!product) {
        await transaction.rollback();
        return { success: false, error: "Không tìm thấy sản phẩm đang kinh doanh." };
      }
      const currentStock = product.stock || 0;
      const delta = parsedStock - currentStock;

      await transaction
        .request()
        .input("id", sql.Int, numId)
        .input("stock", sql.Int, parsedStock)
        .query("UPDATE Products SET stock = @stock, updated_at = GETDATE() WHERE id = @id");

      await transaction
        .request()
        .input("product_id", sql.Int, numId)
        .input("movement_type", sql.NVarChar, "manual_adjustment")
        .input("quantity_change", sql.Int, delta)
        .input("resulting_stock", sql.Int, parsedStock)
        .input("reference_id", sql.NVarChar, null)
        .input("note", sql.NVarChar, note)
        .input("performed_by", sql.NVarChar, performedBy)
        .query(`
          INSERT INTO InventoryMovements (product_id, movement_type, quantity_change, resulting_stock, reference_id, note, performed_by, created_at)
          VALUES (@product_id, @movement_type, @quantity_change, @resulting_stock, @reference_id, @note, @performed_by, GETDATE())
        `);

      await transaction.commit();
      return { success: true, stock: parsedStock };
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async updateVariantStock(productId, variantId, newStock, minStock, maxStock, performedBy = "Staff", note = "Manual variant stock update") {
    const p = await getActivePool();
    const numProductId = Number(productId);
    const parsedStock = Math.max(0, parseInt(newStock, 10));
    const parsedMinStock = Math.max(0, parseInt(minStock, 10));
    const parsedMaxStock = Math.max(0, parseInt(maxStock, 10));
    const transaction = new sql.Transaction(p);
    await transaction.begin();
    try {
      const variantRes = await transaction
        .request()
        .input("product_id", sql.Int, numProductId)
        .input("variant_id", sql.NVarChar, variantId)
        .query(`SELECT pv.id, pv.sku, pv.color_name, pv.size_name, pv.stock_quantity, pv.low_stock_threshold, pv.max_stock_threshold,
                       p.name AS product_name
                FROM ProductVariants pv WITH (UPDLOCK, ROWLOCK)
                JOIN Products p ON p.id = pv.product_id
                WHERE pv.id=@variant_id AND pv.product_id=@product_id AND pv.is_active=1 AND ${activeProductSql("p")}`);
      const variant = variantRes.recordset[0];
      if (!variant) throw new Error("Không tìm thấy biến thể sản phẩm đang hoạt động.");

      const delta = parsedStock - Number(variant.stock_quantity);
      await transaction
        .request()
        .input("variant_id", sql.NVarChar, variantId)
        .input("stock", sql.Int, parsedStock)
        .input("min_stock", sql.Int, parsedMinStock)
        .input("max_stock", sql.Int, parsedMaxStock)
        .query("UPDATE ProductVariants SET stock_quantity=@stock, low_stock_threshold=@min_stock, max_stock_threshold=@max_stock, updated_at=GETDATE() WHERE id=@variant_id");

      const totalRes = await transaction
        .request()
        .input("product_id", sql.Int, numProductId)
        .query("SELECT COALESCE(SUM(stock_quantity), 0) AS total_stock FROM ProductVariants WHERE product_id=@product_id AND is_active=1");
      const totalStock = Number(totalRes.recordset[0].total_stock);

      await transaction
        .request()
        .input("product_id", sql.Int, numProductId)
        .input("stock", sql.Int, totalStock)
        .query("UPDATE Products SET stock=@stock, updated_at=GETDATE() WHERE id=@product_id");

      await transaction
        .request()
        .input("product_id", sql.Int, numProductId)
        .input("variant_id", sql.NVarChar, variantId)
        .input("movement_type", sql.NVarChar, delta === 0 ? "threshold_adjustment" : "manual_adjustment")
        .input("quantity_change", sql.Int, delta)
        .input("resulting_stock", sql.Int, parsedStock)
        .input("reference_id", sql.NVarChar, variant.sku)
        .input("note", sql.NVarChar, `${note} | SKU ${variant.sku} | ${variant.color_name} / ${variant.size_name} | Min ${variant.low_stock_threshold}→${parsedMinStock} | Max ${variant.max_stock_threshold}→${parsedMaxStock}`)
        .input("performed_by", sql.NVarChar, performedBy)
        .input("quantity_before", sql.Int, Number(variant.stock_quantity))
        .input("product_stock_after", sql.Int, totalStock)
        .query(`INSERT INTO InventoryMovements
                (product_id, variant_id, movement_type, quantity_change, resulting_stock, reference_id, note, performed_by, created_at,
                 reason_code,quantity_before,quantity_after,product_stock_after,reference_type)
                VALUES (@product_id, @variant_id, @movement_type, @quantity_change, @resulting_stock, @reference_id, @note, @performed_by, GETDATE(),
                 'manual_correction',@quantity_before,@resulting_stock,@product_stock_after,'manual')`);

      await transaction.commit();
      return {
        success: true,
        productId: numProductId,
        productName: variant.product_name,
        variantInfo: [variant.color_name, variant.size_name].filter(Boolean).join(" - "),
        previousStock: Number(variant.stock_quantity),
        previousMinStock: Number(variant.low_stock_threshold),
        stock: parsedStock,
        minStock: parsedMinStock,
        maxStock: parsedMaxStock,
        totalStock,
        variantId,
        sku: variant.sku,
      };
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async updateVariantPricing(productId, variantId, costPrice, floorPrice) {
    const p = await getActivePool();
    const result = await p.request().input("product_id", sql.Int, Number(productId)).input("variant_id", sql.NVarChar, variantId).query(`SELECT v.id,v.price FROM ProductVariants v JOIN Products p ON p.id=v.product_id WHERE v.id=@variant_id AND v.product_id=@product_id AND v.is_active=1 AND ${activeProductSql("p")}`);
    if (!result.recordset.length) throw new Error("Không tìm thấy SKU cần cập nhật.");
    const sellingPrice = Number(result.recordset[0].price);
    if (costPrice < 0 || floorPrice < costPrice || floorPrice > sellingPrice) throw new Error("Giá phải thỏa mãn: 0 ≤ giá vốn ≤ giá sàn ≤ giá bán.");
    await p.request().input("product_id", sql.Int, Number(productId)).input("variant_id", sql.NVarChar, variantId).input("cost", sql.Decimal(18,0), costPrice).input("floor", sql.Decimal(18,0), floorPrice).query("UPDATE ProductVariants SET cost_price=@cost,floor_price=@floor,updated_at=GETDATE() WHERE id=@variant_id AND product_id=@product_id");
    return { costPrice, floorPrice, sellingPrice };
  },

  async getAllProductsAdmin(scope = "current") {
    const p = await getActivePool();
    const legacySql = legacyProductSql("p");
    const scopeSql = {
      current: `NOT (${legacySql})`,
      legacy: legacySql,
      all: "1=1",
    }[scope] || `NOT (${legacySql})`;
    const res = await p.request().query(`SELECT p.* FROM Products p WHERE ${scopeSql} ORDER BY p.id DESC`);
    const variantRes = await p.request().query(`
      SELECT pv.*,
             latest.created_at AS last_inventory_activity_at,
             latest.movement_type AS last_inventory_movement_type,
             latest.quantity_change AS last_inventory_change,
             latest.performed_by AS last_inventory_actor
      FROM ProductVariants pv
      OUTER APPLY (
        SELECT TOP (1) im.created_at, im.movement_type, im.quantity_change, im.performed_by
        FROM InventoryMovements im
        WHERE im.variant_id = pv.id
        ORDER BY im.created_at DESC, im.id DESC
      ) latest
      ORDER BY pv.product_id, pv.color_name, pv.size_name
    `);
    return res.recordset.map((r) => {
      const catalog = catalogProducts.find((product) => product.id === r.id) || {};
      const variants = variantRes.recordset.filter((variant) => variant.product_id === r.id).map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        color: variant.color_name,
        size: variant.size_name,
        price: Number(variant.price),
        costPrice: Number(variant.cost_price || 0),
        floorPrice: Number(variant.floor_price || 0),
        stock: variant.stock_quantity,
        reservedQuantity: Number(variant.reserved_quantity || 0),
        quarantineQuantity: Number(variant.quarantine_quantity || 0),
        incomingQuantity: Number(variant.incoming_quantity || 0),
        availableQuantity: Math.max(0, Number(variant.stock_quantity || 0) - Number(variant.reserved_quantity || 0) - Number(variant.quarantine_quantity || 0)),
        reorderPoint: Number(variant.reorder_point ?? variant.low_stock_threshold ?? 0),
        leadTimeDays: Number(variant.lead_time_days || 7),
        lowStockThreshold: variant.low_stock_threshold,
        maxStockThreshold: variant.max_stock_threshold,
        isActive: Boolean(variant.is_active),
        individuallyDeactivated: Boolean(variant.individually_deactivated),
        deactivatedAt: variant.deactivated_at,
        deactivatedBy: variant.deactivated_by,
        createdBy: variant.created_by,
        updatedBy: variant.updated_by,
        createdAt: variant.created_at,
        updatedAt: variant.updated_at,
        lastInventoryActivityAt: variant.last_inventory_activity_at,
        lastInventoryMovementType: variant.last_inventory_movement_type,
        lastInventoryChange: variant.last_inventory_change == null ? null : Number(variant.last_inventory_change),
        lastInventoryActor: variant.last_inventory_actor,
      }));
      return {
        ...catalog,
        ...r,
        isActive: Boolean(r.is_active),
        productCode: r.product_code,
        collection: r.collection_name || catalog.collection || "",
        collections: r.collections_json ? JSON.parse(r.collections_json) : (catalog.collections || []),
        material: r.material || catalog.material || "",
        totalStock: variants.reduce((sum, v) => sum + v.stock, 0),
        activeStock: variants.filter((v) => v.isActive).reduce((sum, v) => sum + v.stock, 0),
        variants,
        images: r.images_json ? JSON.parse(r.images_json) : (catalog.images || []),
        colors: r.colors_json ? JSON.parse(r.colors_json) : (catalog.colors || []),
        colorImages: r.color_images_json ? JSON.parse(r.color_images_json) : (catalog.colorImages || {}),
      };
    });
  },

  async getProductCreateMetadata() {
    const p = await getActivePool();
    const result = await p.request().query("SELECT product_code FROM Products WITH (READCOMMITTEDLOCK)");
    const highestNumber = result.recordset.reduce((highest, row) => {
      const match = String(row.product_code || "").trim().match(/^MR-(\d+)$/i);
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 105);
    const nextNumber = highestNumber + 1;
    return {
      nextProductCode: `MR-${String(nextNumber).padStart(3, "0")}`,
      sizePresets: {
        clothing: ["XS", "S", "M", "L", "XL"],
        footwear: ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45"],
        accessories: ["ONE SIZE"],
      },
      defaultInventoryPolicy: { min: 3, max: 30 },
    };
  },

  async createProductAdmin(data, actor = "Admin") {
    const p = await getActivePool();
    const {
      name, price, category, gender, productCode, description, material,
      collectionName, collections = [], images = [], colors = [], colorImages = {},
      minAlert = 5, variants = []
    } = data;

    if (!name || !price || !category || !gender || !productCode) {
      throw new Error("Vui lòng cung cấp đầy đủ tên, giá, danh mục, đối tượng và mã sản phẩm (MR-xxx).");
    }
    if (isLegacyProductCode(productCode)) {
      throw new Error("Mã sản phẩm từ 105 trở xuống đã được lưu trữ và không thể tạo mới.");
    }
    if (!Array.isArray(variants) || variants.length === 0) {
      throw new Error("Sản phẩm phải có ít nhất một SKU được khai báo rõ ràng.");
    }

    const normalizedCategory = String(category).trim().toLowerCase();
    const normalizedVariants = variants.map((variant, index) => {
      const color = validateCatalogColor(variant.color);
      const size = validateCatalogSize(variant.size, normalizedCategory);
      const sku = String(variant.sku || "").trim().toUpperCase();
      const variantPrice = Number(variant.price);
      const costPrice = Number(variant.costPrice);
      const floorPrice = Number(variant.floorPrice);
      const stock = Number(variant.stock);
      const minStock = Number(variant.minStock);
      const maxStock = Number(variant.maxStock);
      if (!sku || !color || !size) throw new Error(`SKU dòng ${index + 1} phải có mã SKU, màu sắc và kích cỡ.`);
      if (!(variantPrice > 0) || !(costPrice > 0) || floorPrice < costPrice || floorPrice > variantPrice) {
        throw new Error(`SKU ${sku}: giá vốn phải lớn hơn 0 và cần thỏa mãn giá vốn ≤ giá sàn ≤ giá bán.`);
      }
      if (![stock, minStock, maxStock].every(Number.isInteger) || stock < 0 || minStock < 0 || maxStock <= minStock) {
        throw new Error(`SKU ${sku}: tồn kho phải là số nguyên không âm và mức tối đa phải lớn hơn mức tối thiểu.`);
      }
      return { ...variant, sku, color, size, price: variantPrice, costPrice, floorPrice, stock, minStock, maxStock };
    });
    if (new Set(normalizedVariants.map((variant) => variant.sku)).size !== normalizedVariants.length) {
      throw new Error("Danh sách có mã SKU trùng nhau.");
    }
    const selections = normalizedVariants.map((variant) => `${variant.color.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()}|${variant.size}`);
    if (new Set(selections).size !== selections.length) throw new Error("Danh sách có tổ hợp màu và kích cỡ trùng nhau.");

    const transaction = new sql.Transaction(p);
    await transaction.begin();
    try {
      const lockedCodes = await transaction.request().query("SELECT product_code FROM Products WITH (UPDLOCK, HOLDLOCK)");
      const highestCodeNumber = lockedCodes.recordset.reduce((highest, row) => {
        const match = String(row.product_code || "").trim().match(/^MR-(\d+)$/i);
        return match ? Math.max(highest, Number(match[1])) : highest;
      }, 105);
      const expectedCode = `MR-${String(highestCodeNumber + 1).padStart(3, "0")}`;
      const normalizedProductCode = productCode.trim().toUpperCase();
      if (normalizedProductCode !== expectedCode) {
        throw new Error(`Mã sản phẩm đã thay đổi do dữ liệu mới. Vui lòng mở lại biểu mẫu để sử dụng mã ${expectedCode}.`);
      }
      const nextIdRes = await transaction.request().query("SELECT COALESCE(MAX(id), 100) + 1 AS next_id FROM Products WITH (UPDLOCK, HOLDLOCK)");
      const nextId = nextIdRes.recordset[0].next_id;

      const totalStock = normalizedVariants.reduce((sum, v) => sum + v.stock, 0);

      await transaction.request()
        .input("id", sql.Int, nextId)
        .input("product_code", sql.NVarChar, normalizedProductCode)
        .input("name", sql.NVarChar, name.trim())
        .input("price", sql.Decimal(18, 0), Number(price))
        .input("category", sql.NVarChar, normalizedCategory)
        .input("gender", sql.NVarChar, gender.trim())
        .input("description", sql.NVarChar, description || "")
        .input("material", sql.NVarChar, material || "")
        .input("collection_name", sql.NVarChar, collectionName || null)
        .input("collections_json", sql.NVarChar, JSON.stringify(collections))
        .input("images_json", sql.NVarChar, JSON.stringify(images))
        .input("colors_json", sql.NVarChar, JSON.stringify(colors))
        .input("color_images_json", sql.NVarChar, JSON.stringify(colorImages))
        .input("stock", sql.Int, totalStock)
        .input("min_alert", sql.Int, Math.max(0, parseInt(minAlert, 10)))
        .input("is_active", sql.Bit, 1)
        .input("created_by", sql.NVarChar, actor)
        .query(`
          INSERT INTO Products (id, product_code, name, price, category, gender, description, material, collection_name, collections_json, images_json, colors_json, color_images_json, stock, min_alert, is_active, created_by, created_at, updated_at)
          VALUES (@id, @product_code, @name, @price, @category, @gender, @description, @material, @collection_name, @collections_json, @images_json, @colors_json, @color_images_json, @stock, @min_alert, @is_active, @created_by, GETDATE(), GETDATE())
        `);

      let initialDocumentId = null;
      const initialDocumentCode = `INIT-${normalizedProductCode}`;
      if (totalStock > 0) {
        const documentResult = await transaction.request()
          .input("document_code", sql.NVarChar, initialDocumentCode)
          .input("reference_id", sql.NVarChar, normalizedProductCode)
          .input("note", sql.NVarChar, `Phiếu nhập tồn ban đầu khi tạo sản phẩm ${normalizedProductCode}`)
          .input("actor", sql.NVarChar, actor)
          .query(`
            INSERT INTO InventoryDocuments (document_code,document_type,status,reference_id,note,created_by,approved_by,created_at,completed_at)
            OUTPUT INSERTED.id
            VALUES (@document_code,'receipt','completed',@reference_id,@note,@actor,@actor,GETDATE(),GETDATE())
          `);
        initialDocumentId = documentResult.recordset[0].id;
      }

      for (let i = 0; i < normalizedVariants.length; i++) {
        const v = normalizedVariants[i];
        const color = v.color;
        const size = v.size;
        const variantId = v.id || `v-${nextId}-${color.toLowerCase().replace(/[^a-z0-9]/g, "")}-${size.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
        const sku = v.sku;
        const vStock = v.stock;
        const vMin = v.minStock;
        const vMax = v.maxStock;
        const vPrice = v.price;
        const vCost = v.costPrice;
        const vFloor = v.floorPrice;

        await transaction.request()
          .input("id", sql.NVarChar, variantId)
          .input("product_id", sql.Int, nextId)
          .input("sku", sql.NVarChar, sku)
          .input("color_name", sql.NVarChar, color)
          .input("size_name", sql.NVarChar, size)
          .input("price", sql.Decimal(18, 0), vPrice)
          .input("cost_price", sql.Decimal(18, 0), vCost)
          .input("floor_price", sql.Decimal(18, 0), vFloor)
          .input("stock_quantity", sql.Int, vStock)
          .input("low_stock_threshold", sql.Int, vMin)
          .input("max_stock_threshold", sql.Int, vMax)
          .input("is_active", sql.Bit, 1)
          .input("created_by", sql.NVarChar, actor)
          .query(`
            INSERT INTO ProductVariants (id, product_id, sku, color_name, size_name, price, cost_price, floor_price, stock_quantity, low_stock_threshold, max_stock_threshold, is_active, created_by, created_at, updated_at)
            VALUES (@id, @product_id, @sku, @color_name, @size_name, @price, @cost_price, @floor_price, @stock_quantity, @low_stock_threshold, @max_stock_threshold, @is_active, @created_by, GETDATE(), GETDATE())
          `);

        if (vStock > 0) {
          await transaction.request()
            .input("product_id", sql.Int, nextId)
            .input("variant_id", sql.NVarChar, variantId)
            .input("movement_type", sql.NVarChar, "initial_stock")
            .input("quantity_change", sql.Int, vStock)
            .input("resulting_stock", sql.Int, vStock)
            .input("reference_id", sql.NVarChar, initialDocumentCode)
            .input("note", sql.NVarChar, `Khởi tạo tồn kho ban đầu cho SKU ${sku}`)
            .input("performed_by", sql.NVarChar, actor)
            .query(`
              INSERT INTO InventoryMovements (product_id,variant_id,movement_type,quantity_change,resulting_stock,reference_id,note,performed_by,created_at,reason_code,quantity_before,quantity_after,product_stock_after,reference_type,approved_by)
              VALUES (@product_id,@variant_id,@movement_type,@quantity_change,@resulting_stock,@reference_id,@note,@performed_by,GETDATE(),'INITIAL_RECEIPT',0,@resulting_stock,@resulting_stock,'inventory_document',@performed_by)
            `);
          await transaction.request()
            .input("document_id", sql.BigInt, initialDocumentId)
            .input("product_id", sql.Int, nextId)
            .input("variant_id", sql.NVarChar, variantId)
            .input("quantity", sql.Int, vStock)
            .input("unit_cost", sql.Decimal(18, 0), vCost)
            .query(`
              INSERT INTO InventoryDocumentItems (document_id,product_id,variant_id,expected_quantity,actual_quantity,quantity_change,unit_cost,disposition,created_at,sellable_quantity,quarantine_quantity,unit_cost_before,unit_cost_after)
              VALUES (@document_id,@product_id,@variant_id,@quantity,@quantity,@quantity,@unit_cost,'sellable',GETDATE(),@quantity,0,0,@unit_cost)
            `);
        }
      }

      await transaction.commit();
      return { success: true, id: nextId, productCode: normalizedProductCode, initialInventoryDocument: initialDocumentId ? initialDocumentCode : null };
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async updateProductAdmin(id, data, actor = "Admin") {
    const p = await getActivePool();
    const numId = Number(id);
    const existing = await p.request().input("id", sql.Int, numId).query("SELECT * FROM Products WHERE id = @id");
    if (!existing.recordset.length) throw new Error("Không tìm thấy sản phẩm cần cập nhật.");

    const r = existing.recordset[0];
    if (isLegacyProductCode(r.product_code)) throw new Error("Sản phẩm mã cũ đã được lưu trữ và không thể chỉnh sửa.");
    const name = data.name !== undefined ? data.name.trim() : r.name;
    const price = data.price !== undefined ? Number(data.price) : Number(r.price);
    const category = data.category !== undefined ? data.category.trim() : r.category;
    const gender = data.gender !== undefined ? data.gender.trim() : r.gender;
    const description = data.description !== undefined ? data.description : r.description;
    const material = data.material !== undefined ? data.material : r.material;
    const collectionName = data.collectionName !== undefined ? data.collectionName : r.collection_name;
    const collectionsJson = data.collections !== undefined ? JSON.stringify(data.collections) : r.collections_json;
    const imagesJson = data.images !== undefined ? JSON.stringify(data.images) : r.images_json;
    const colorsJson = data.colors !== undefined ? JSON.stringify(data.colors) : r.colors_json;
    const colorImagesJson = data.colorImages !== undefined ? JSON.stringify(data.colorImages) : r.color_images_json;
    const minAlert = data.minAlert !== undefined ? Math.max(0, parseInt(data.minAlert, 10)) : r.min_alert;

    const variantsToValidate = Array.isArray(data.variants) && data.variants.length
      ? data.variants
      : (await p.request().input("product_id", sql.Int, numId).query("SELECT color_name color,size_name size FROM ProductVariants WHERE product_id=@product_id AND is_active=1")).recordset;
    for (const variant of variantsToValidate) {
      validateCatalogColor(variant.color);
      validateCatalogSize(variant.size, category);
    }

    await p.request()
      .input("id", sql.Int, numId)
      .input("name", sql.NVarChar, name)
      .input("price", sql.Decimal(18, 0), price)
      .input("category", sql.NVarChar, category)
      .input("gender", sql.NVarChar, gender)
      .input("description", sql.NVarChar, description)
      .input("material", sql.NVarChar, material)
      .input("collection_name", sql.NVarChar, collectionName)
      .input("collections_json", sql.NVarChar, collectionsJson)
      .input("images_json", sql.NVarChar, imagesJson)
      .input("colors_json", sql.NVarChar, colorsJson)
      .input("color_images_json", sql.NVarChar, colorImagesJson)
      .input("min_alert", sql.Int, minAlert)
      .input("updated_by", sql.NVarChar, actor)
      .query(`
        UPDATE Products
        SET name = @name, price = @price, category = @category, gender = @gender,
            description = @description, material = @material, collection_name = @collection_name,
            collections_json = @collections_json, images_json = @images_json, colors_json = @colors_json,
            color_images_json = @color_images_json, min_alert = @min_alert,
            updated_by = @updated_by, updated_at = GETDATE()
        WHERE id = @id
      `);

    return { success: true, id: numId };
  },

  async softDeleteProductAdmin(id, actor = "Admin", reason = "Tạm ngừng kinh doanh") {
    const p = await getActivePool();
    const numId = Number(id);
    const existing = await p.request().input("id", sql.Int, numId).query("SELECT id, product_code, name, is_active FROM Products WHERE id = @id");
    if (!existing.recordset.length) throw new Error("Không tìm thấy sản phẩm.");
    if (!existing.recordset[0].is_active) throw new Error("Sản phẩm đã ở trạng thái ngừng kinh doanh.");

    const transaction = new sql.Transaction(p);
    await transaction.begin();
    try {
      await transaction.request()
        .input("id", sql.Int, numId)
        .input("actor", sql.NVarChar, actor)
        .query(`
          UPDATE Products
          SET is_active = 0, deactivated_at = GETDATE(), deactivated_by = @actor, updated_by = @actor, updated_at = GETDATE()
          WHERE id = @id
        `);

      // Deactivate variants that were not already individually deactivated
      await transaction.request()
        .input("product_id", sql.Int, numId)
        .input("actor", sql.NVarChar, actor)
        .query(`
          UPDATE ProductVariants
          SET is_active = 0, deactivated_at = GETDATE(), deactivated_by = @actor, updated_by = @actor, updated_at = GETDATE()
          WHERE product_id = @product_id AND is_active = 1 AND individually_deactivated = 0
        `);

      await transaction.request()
        .input("product_id", sql.Int, numId)
        .input("movement_type", sql.NVarChar, "product_deactivated")
        .input("quantity_change", sql.Int, 0)
        .input("resulting_stock", sql.Int, 0)
        .input("reference_id", sql.NVarChar, existing.recordset[0].product_code)
        .input("note", sql.NVarChar, `Xóa mềm sản phẩm: ${reason}`)
        .input("performed_by", sql.NVarChar, actor)
        .query(`
          INSERT INTO InventoryMovements (product_id, movement_type, quantity_change, resulting_stock, reference_id, note, performed_by, created_at)
          VALUES (@product_id, @movement_type, @quantity_change, @resulting_stock, @reference_id, @note, @performed_by, GETDATE())
        `);

      await transaction.commit();
      return { success: true, id: numId, isActive: false };
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async restoreProductAdmin(id, actor = "Admin") {
    const p = await getActivePool();
    const numId = Number(id);
    const existing = await p.request().input("id", sql.Int, numId).query("SELECT id, product_code, name, is_active FROM Products WHERE id = @id");
    if (!existing.recordset.length) throw new Error("Không tìm thấy sản phẩm.");
    if (isLegacyProductCode(existing.recordset[0].product_code)) throw new Error("Sản phẩm mã cũ đã được lưu trữ và không thể khôi phục.");
    if (existing.recordset[0].is_active) throw new Error("Sản phẩm đang hoạt động, không cần khôi phục.");

    const transaction = new sql.Transaction(p);
    await transaction.begin();
    try {
      await transaction.request()
        .input("id", sql.Int, numId)
        .input("actor", sql.NVarChar, actor)
        .query(`
          UPDATE Products
          SET is_active = 1, deactivated_at = NULL, deactivated_by = NULL, updated_by = @actor, updated_at = GETDATE()
          WHERE id = @id
        `);

      // Critical requirement: Do NOT reactivate variants that were individually deactivated!
      await transaction.request()
        .input("product_id", sql.Int, numId)
        .input("actor", sql.NVarChar, actor)
        .query(`
          UPDATE ProductVariants
          SET is_active = 1, deactivated_at = NULL, deactivated_by = NULL, updated_by = @actor, updated_at = GETDATE()
          WHERE product_id = @product_id AND individually_deactivated = 0
        `);

      // Recalculate active stock
      await transaction.request()
        .input("product_id", sql.Int, numId)
        .query(`
          UPDATE Products
          SET stock = (SELECT COALESCE(SUM(stock_quantity), 0) FROM ProductVariants WHERE product_id = @product_id AND is_active = 1)
          WHERE id = @product_id
        `);

      await transaction.request()
        .input("product_id", sql.Int, numId)
        .input("movement_type", sql.NVarChar, "product_restored")
        .input("quantity_change", sql.Int, 0)
        .input("resulting_stock", sql.Int, 0)
        .input("reference_id", sql.NVarChar, existing.recordset[0].product_code)
        .input("note", sql.NVarChar, "Khôi phục kinh doanh sản phẩm (bảo lưu các SKU đã ngừng bán riêng)")
        .input("performed_by", sql.NVarChar, actor)
        .query(`
          INSERT INTO InventoryMovements (product_id, movement_type, quantity_change, resulting_stock, reference_id, note, performed_by, created_at)
          VALUES (@product_id, @movement_type, @quantity_change, @resulting_stock, @reference_id, @note, @performed_by, GETDATE())
        `);

      await transaction.commit();
      return { success: true, id: numId, isActive: true };
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async createVariantAdmin(productId, data, actor = "Admin") {
    const p = await getActivePool();
    const numProductId = Number(productId);
    const prodRes = await p.request().input("id", sql.Int, numProductId).query("SELECT id, product_code, price, category FROM Products WHERE id = @id");
    if (!prodRes.recordset.length) throw new Error("Không tìm thấy sản phẩm.");
    const prod = prodRes.recordset[0];
    if (isLegacyProductCode(prod.product_code)) throw new Error("Không thể thêm SKU cho sản phẩm mã cũ đã lưu trữ.");

    const color = validateCatalogColor(data.color);
    const size = validateCatalogSize(data.size, prod.category);
    const variantId = data.id || `v-${numProductId}-${color.toLowerCase().replace(/[^a-z0-9]/g, "")}-${size.toLowerCase()}`;
    const sku = data.sku || `${prod.product_code}-${color.toUpperCase().replace(/[^A-Z0-9]/g, "")}-${size.toUpperCase()}`;

    const checkSku = await p.request().input("sku", sql.NVarChar, sku).query("SELECT id FROM ProductVariants WHERE sku = @sku");
    if (checkSku.recordset.length) throw new Error(`SKU "${sku}" đã tồn tại trên hệ thống.`);
    const checkSelection = await p.request().input("product_id", sql.Int, numProductId).input("color", sql.NVarChar, color).input("size", sql.NVarChar, size)
      .query("SELECT id FROM ProductVariants WHERE product_id=@product_id AND UPPER(color_name)=UPPER(@color) AND UPPER(size_name)=UPPER(@size)");
    if (checkSelection.recordset.length) throw new Error(`Tổ hợp ${color} / ${size} đã tồn tại trên sản phẩm.`);

    const stock = Math.max(0, parseInt(data.stock || 0, 10));
    const minStock = Math.max(0, parseInt(data.minStock || 3, 10));
    const maxStock = Math.max(minStock + 1, parseInt(data.maxStock || 50, 10));
    const price = Number(data.price || prod.price);
    const costPrice = data.costPrice != null ? Number(data.costPrice) : null;
    const floorPrice = data.floorPrice != null ? Number(data.floorPrice) : null;

    if (costPrice != null && floorPrice != null) {
      if (costPrice < 0 || floorPrice < costPrice || floorPrice > price) {
        throw new Error("Giá phải thỏa mãn: 0 ≤ giá vốn ≤ giá sàn ≤ giá bán.");
      }
    }

    const transaction = new sql.Transaction(p);
    await transaction.begin();
    try {
      await transaction.request()
        .input("id", sql.NVarChar, variantId)
        .input("product_id", sql.Int, numProductId)
        .input("sku", sql.NVarChar, sku)
        .input("color_name", sql.NVarChar, color)
        .input("size_name", sql.NVarChar, size)
        .input("price", sql.Decimal(18, 0), price)
        .input("cost_price", sql.Decimal(18, 0), costPrice)
        .input("floor_price", sql.Decimal(18, 0), floorPrice)
        .input("stock_quantity", sql.Int, stock)
        .input("low_stock_threshold", sql.Int, minStock)
        .input("max_stock_threshold", sql.Int, maxStock)
        .input("is_active", sql.Bit, 1)
        .input("created_by", sql.NVarChar, actor)
        .query(`
          INSERT INTO ProductVariants (id, product_id, sku, color_name, size_name, price, cost_price, floor_price, stock_quantity, low_stock_threshold, max_stock_threshold, is_active, individually_deactivated, created_by, created_at, updated_at)
          VALUES (@id, @product_id, @sku, @color_name, @size_name, @price, @cost_price, @floor_price, @stock_quantity, @low_stock_threshold, @max_stock_threshold, @is_active, 0, @created_by, GETDATE(), GETDATE())
        `);

      await transaction.request()
        .input("product_id", sql.Int, numProductId)
        .query(`
          UPDATE Products
          SET stock = (SELECT COALESCE(SUM(stock_quantity), 0) FROM ProductVariants WHERE product_id = @product_id AND is_active = 1)
          WHERE id = @product_id
        `);

      if (stock > 0) {
        await transaction.request()
          .input("product_id", sql.Int, numProductId)
          .input("variant_id", sql.NVarChar, variantId)
          .input("movement_type", sql.NVarChar, "initial_stock")
          .input("quantity_change", sql.Int, stock)
          .input("resulting_stock", sql.Int, stock)
          .input("reference_id", sql.NVarChar, sku)
          .input("note", sql.NVarChar, `Tạo biến thể mới SKU ${sku} với tồn kho ${stock}`)
          .input("performed_by", sql.NVarChar, actor)
          .query(`
            INSERT INTO InventoryMovements (product_id, variant_id, movement_type, quantity_change, resulting_stock, reference_id, note, performed_by, created_at)
            VALUES (@product_id, @variant_id, @movement_type, @quantity_change, @resulting_stock, @reference_id, @note, @performed_by, GETDATE())
          `);
      }

      await transaction.commit();
      return { success: true, variantId, sku };
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async updateVariantAdmin(productId, variantId, data, actor = "Admin") {
    const p = await getActivePool();
    const numProductId = Number(productId);
    const existing = await p.request()
      .input("product_id", sql.Int, numProductId)
      .input("id", sql.NVarChar, variantId)
      .query("SELECT * FROM ProductVariants WHERE id = @id AND product_id = @product_id");
    if (!existing.recordset.length) throw new Error("Không tìm thấy biến thể SKU.");
    const product = await p.request().input("id", sql.Int, numProductId).query("SELECT product_code,category FROM Products WHERE id = @id");
    if (isLegacyProductCode(product.recordset[0]?.product_code)) throw new Error("SKU thuộc sản phẩm mã cũ đã lưu trữ và không thể chỉnh sửa.");

    const r = existing.recordset[0];
    const color = validateCatalogColor(data.color !== undefined ? data.color : r.color_name);
    const size = validateCatalogSize(data.size !== undefined ? data.size : r.size_name, product.recordset[0]?.category);
    const price = data.price !== undefined ? Number(data.price) : Number(r.price);
    const costPrice = data.costPrice !== undefined ? (data.costPrice != null ? Number(data.costPrice) : null) : (r.cost_price != null ? Number(r.cost_price) : null);
    const floorPrice = data.floorPrice !== undefined ? (data.floorPrice != null ? Number(data.floorPrice) : null) : (r.floor_price != null ? Number(r.floor_price) : null);
    const minStock = data.minStock !== undefined ? Math.max(0, parseInt(data.minStock, 10)) : r.low_stock_threshold;
    const maxStock = data.maxStock !== undefined ? Math.max(minStock + 1, parseInt(data.maxStock, 10)) : r.max_stock_threshold;

    const duplicateSelection = await p.request().input("product_id", sql.Int, numProductId).input("id", sql.NVarChar, variantId)
      .input("color", sql.NVarChar, color).input("size", sql.NVarChar, size)
      .query("SELECT id FROM ProductVariants WHERE product_id=@product_id AND id<>@id AND UPPER(color_name)=UPPER(@color) AND UPPER(size_name)=UPPER(@size)");
    if (duplicateSelection.recordset.length) throw new Error(`Tổ hợp ${color} / ${size} đã tồn tại trên sản phẩm.`);

    if (costPrice != null && floorPrice != null) {
      if (costPrice < 0 || floorPrice < costPrice || floorPrice > price) {
        throw new Error("Giá phải thỏa mãn: 0 ≤ giá vốn ≤ giá sàn ≤ giá bán.");
      }
    }

    await p.request()
      .input("product_id", sql.Int, numProductId)
      .input("id", sql.NVarChar, variantId)
      .input("color_name", sql.NVarChar, color)
      .input("size_name", sql.NVarChar, size)
      .input("price", sql.Decimal(18, 0), price)
      .input("cost_price", sql.Decimal(18, 0), costPrice)
      .input("floor_price", sql.Decimal(18, 0), floorPrice)
      .input("low_stock_threshold", sql.Int, minStock)
      .input("max_stock_threshold", sql.Int, maxStock)
      .input("updated_by", sql.NVarChar, actor)
      .query(`
        UPDATE ProductVariants
        SET color_name = @color_name, size_name = @size_name, price = @price,
            cost_price = @cost_price, floor_price = @floor_price,
            low_stock_threshold = @low_stock_threshold, max_stock_threshold = @max_stock_threshold,
            updated_by = @updated_by, updated_at = GETDATE()
        WHERE id = @id AND product_id = @product_id
      `);

    return { success: true, variantId };
  },

  async softDeleteVariantAdmin(productId, variantId, actor = "Admin", reason = "Ngừng bán biến thể") {
    const p = await getActivePool();
    const numProductId = Number(productId);
    const existing = await p.request()
      .input("product_id", sql.Int, numProductId)
      .input("id", sql.NVarChar, variantId)
      .query("SELECT id, sku, is_active, stock_quantity FROM ProductVariants WHERE id = @id AND product_id = @product_id");
    if (!existing.recordset.length) throw new Error("Không tìm thấy biến thể SKU.");
    if (!existing.recordset[0].is_active) throw new Error("Biến thể này đã ngừng kinh doanh.");

    const transaction = new sql.Transaction(p);
    await transaction.begin();
    try {
      await transaction.request()
        .input("product_id", sql.Int, numProductId)
        .input("id", sql.NVarChar, variantId)
        .input("actor", sql.NVarChar, actor)
        .query(`
          UPDATE ProductVariants
          SET is_active = 0, individually_deactivated = 1,
              deactivated_at = GETDATE(), deactivated_by = @actor,
              updated_by = @actor, updated_at = GETDATE()
          WHERE id = @id AND product_id = @product_id
        `);

      await transaction.request()
        .input("product_id", sql.Int, numProductId)
        .query(`
          UPDATE Products
          SET stock = (SELECT COALESCE(SUM(stock_quantity), 0) FROM ProductVariants WHERE product_id = @product_id AND is_active = 1)
          WHERE id = @product_id
        `);

      await transaction.request()
        .input("product_id", sql.Int, numProductId)
        .input("variant_id", sql.NVarChar, variantId)
        .input("movement_type", sql.NVarChar, "sku_deactivated")
        .input("quantity_change", sql.Int, 0)
        .input("resulting_stock", sql.Int, existing.recordset[0].stock_quantity)
        .input("reference_id", sql.NVarChar, existing.recordset[0].sku)
        .input("note", sql.NVarChar, `Ngừng kinh doanh SKU ${existing.recordset[0].sku}: ${reason}`)
        .input("performed_by", sql.NVarChar, actor)
        .query(`
          INSERT INTO InventoryMovements (product_id, variant_id, movement_type, quantity_change, resulting_stock, reference_id, note, performed_by, created_at)
          VALUES (@product_id, @variant_id, @movement_type, @quantity_change, @resulting_stock, @reference_id, @note, @performed_by, GETDATE())
        `);

      await transaction.commit();
      return { success: true, variantId, isActive: false };
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async restoreVariantAdmin(productId, variantId, actor = "Admin") {
    const p = await getActivePool();
    const numProductId = Number(productId);
    const product = await p.request().input("id", sql.Int, numProductId).query("SELECT product_code FROM Products WHERE id = @id");
    if (isLegacyProductCode(product.recordset[0]?.product_code)) throw new Error("SKU thuộc sản phẩm mã cũ đã lưu trữ và không thể khôi phục.");
    const existing = await p.request()
      .input("product_id", sql.Int, numProductId)
      .input("id", sql.NVarChar, variantId)
      .query("SELECT id, sku, is_active, stock_quantity FROM ProductVariants WHERE id = @id AND product_id = @product_id");
    if (!existing.recordset.length) throw new Error("Không tìm thấy biến thể SKU.");
    if (existing.recordset[0].is_active) throw new Error("Biến thể này đang hoạt động bình thường.");

    const transaction = new sql.Transaction(p);
    await transaction.begin();
    try {
      await transaction.request()
        .input("product_id", sql.Int, numProductId)
        .input("id", sql.NVarChar, variantId)
        .input("actor", sql.NVarChar, actor)
        .query(`
          UPDATE ProductVariants
          SET is_active = 1, individually_deactivated = 0,
              deactivated_at = NULL, deactivated_by = NULL,
              updated_by = @actor, updated_at = GETDATE()
          WHERE id = @id AND product_id = @product_id
        `);

      await transaction.request()
        .input("product_id", sql.Int, numProductId)
        .query(`
          UPDATE Products
          SET stock = (SELECT COALESCE(SUM(stock_quantity), 0) FROM ProductVariants WHERE product_id = @product_id AND is_active = 1)
          WHERE id = @product_id
        `);

      await transaction.request()
        .input("product_id", sql.Int, numProductId)
        .input("variant_id", sql.NVarChar, variantId)
        .input("movement_type", sql.NVarChar, "sku_restored")
        .input("quantity_change", sql.Int, 0)
        .input("resulting_stock", sql.Int, existing.recordset[0].stock_quantity)
        .input("reference_id", sql.NVarChar, existing.recordset[0].sku)
        .input("note", sql.NVarChar, `Khôi phục kinh doanh SKU ${existing.recordset[0].sku}`)
        .input("performed_by", sql.NVarChar, actor)
        .query(`
          INSERT INTO InventoryMovements (product_id, variant_id, movement_type, quantity_change, resulting_stock, reference_id, note, performed_by, created_at)
          VALUES (@product_id, @variant_id, @movement_type, @quantity_change, @resulting_stock, @reference_id, @note, @performed_by, GETDATE())
        `);

      await transaction.commit();
      return { success: true, variantId, isActive: true };
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  // ==========================================
  // ORDERS TABLE & ACID TRANSACTIONS
  // ==========================================
  async getAllOrders() {
    const p = await getActivePool();
    const ordersRes = await p.request().query("SELECT * FROM Orders ORDER BY created_at DESC");
    const itemsRes = await p.request().query("SELECT * FROM OrderItems");
    const historyRes = await p.request().query("SELECT * FROM OrderStatusHistory ORDER BY created_at ASC");
    const paymentsRes = await p.request().query("SELECT * FROM Payments");

    const itemsByOrder = {};
    itemsRes.recordset.forEach((it) => {
      if (!itemsByOrder[it.order_id]) itemsByOrder[it.order_id] = [];
      itemsByOrder[it.order_id].push(it);
    });

    const historyByOrder = {};
    historyRes.recordset.forEach((h) => {
      if (!historyByOrder[h.order_id]) historyByOrder[h.order_id] = [];
      historyByOrder[h.order_id].push(h);
    });

    const paymentByOrder = {};
    paymentsRes.recordset.forEach((pmt) => {
      paymentByOrder[pmt.order_id] = pmt;
    });

    return ordersRes.recordset.map((o) => ({
      ...o,
      status: o.order_status,
      items: itemsByOrder[o.id] || [],
      history: historyByOrder[o.id] || [],
      payment: paymentByOrder[o.id] || null,
    }));
  },

  async getOrdersByCustomer(customerId) {
    const all = await this.getAllOrders();
    return all.filter((o) => o.customer_id === customerId);
  },

  async getOrderById(id) {
    const all = await this.getAllOrders();
    return all.find((o) => o.id === id) || null;
  },

  async getProductVariantOptions(productId) {
    const p = await getActivePool();
    const result = await p.request().input("product_id", sql.Int, Number(productId)).query(`
      SELECT DISTINCT v.color_name, v.size_name
      FROM ProductVariants v JOIN Products p ON p.id=v.product_id
      WHERE v.product_id=@product_id AND v.is_active=1 AND ${activeProductSql("p")}
      ORDER BY v.color_name, v.size_name
    `);
    const variants = result.recordset;
    return {
      sizes: [...new Set(variants.map((variant) => variant.size_name).filter(Boolean))],
      colors: [...new Set(variants.map((variant) => variant.color_name).filter(Boolean))],
      variants: variants.map((variant) => ({ size: variant.size_name, color: variant.color_name })),
    };
  },

  async createReturnRequest(record) {
    const p = await getActivePool();
    await p.request()
      .input("id", sql.NVarChar, record.id)
      .input("order_id", sql.NVarChar, record.orderId)
      .input("order_item_id", sql.Int, record.orderItemId)
      .input("customer_id", sql.NVarChar, record.customerId)
      .input("customer_email", sql.NVarChar, record.customerEmail || null)
      .input("request_type", sql.NVarChar, record.requestType)
      .input("reason_code", sql.NVarChar, record.reasonCode)
      .input("reason_detail", sql.NVarChar, record.reasonDetail || null)
      .input("quantity", sql.Int, record.quantity)
      .input("exchange_size", sql.NVarChar, record.exchangeSize || null)
      .input("exchange_color", sql.NVarChar, record.exchangeColor || null)
      .input("refund_bank_code", sql.NVarChar, record.refundBankCode || null)
      .input("refund_bank_name", sql.NVarChar, record.refundBankName || null)
      .input("refund_account_number", sql.NVarChar, record.refundAccountNumber || null)
      .input("refund_account_holder", sql.NVarChar, record.refundAccountHolder || null)
      .input("amount", sql.Decimal(18, 0), record.amount || 0)
      .input("status", sql.NVarChar, record.status)
      .input("decision_reason", sql.NVarChar, record.decisionReason)
      .input("deadline", sql.DateTime2, record.deadline || null)
      .query(`INSERT INTO ReturnRequests(id,order_id,order_item_id,customer_id,customer_email,request_type,reason_code,reason_detail,requested_quantity,exchange_size,exchange_color,refund_bank_code,refund_bank_name,refund_account_number,refund_account_holder,requested_amount,status,decision_reason,return_deadline,created_at,updated_at)
        VALUES(@id,@order_id,@order_item_id,@customer_id,@customer_email,@request_type,@reason_code,@reason_detail,@quantity,@exchange_size,@exchange_color,@refund_bank_code,@refund_bank_name,@refund_account_number,@refund_account_holder,@amount,@status,@decision_reason,@deadline,GETDATE(),GETDATE())`);
    return this.getReturnRequestById(record.id);
  },

  async getReturnRequestForOrderItem({ customerId, orderItemId }) {
    const p = await getActivePool();
    const result = await p.request()
      .input("customer_id", sql.NVarChar, customerId)
      .input("order_item_id", sql.Int, Number(orderItemId))
      .query(`SELECT TOP 1 id,status,request_type,created_at
        FROM ReturnRequests
        WHERE customer_id=@customer_id AND order_item_id=@order_item_id
        ORDER BY created_at DESC`);
    return result.recordset[0] || null;
  },

  async getReturnRequestById(id) {
    const p = await getActivePool();
    const result = await p.request().input("id", sql.NVarChar, id).query(`SELECT rr.*,o.customer_name,o.customer_email AS order_customer_email,oi.product_name,oi.selected_color,oi.selected_size,oi.image_url
      FROM ReturnRequests rr JOIN Orders o ON o.id=rr.order_id JOIN OrderItems oi ON oi.id=rr.order_item_id WHERE rr.id=@id`);
    const row = result.recordset[0];
    if (!row) return null;
    return {
      ...row,
      customer_email: row.customer_email || row.order_customer_email,
    };
  },

  async getReturnRequests({ customerId = null } = {}) {
    const p = await getActivePool();
    const request = p.request();
    let where = "";
    if (customerId) { request.input("customer_id", sql.NVarChar, customerId); where = "WHERE rr.customer_id=@customer_id"; }
    const result = await request.query(`SELECT rr.*,o.customer_name,o.customer_email AS order_customer_email,oi.product_name,oi.selected_color,oi.selected_size,oi.image_url
      FROM ReturnRequests rr JOIN Orders o ON o.id=rr.order_id JOIN OrderItems oi ON oi.id=rr.order_item_id ${where} ORDER BY rr.created_at DESC`);
    return result.recordset.map((row) => ({
      ...row,
      customer_email: row.customer_email || row.order_customer_email,
    }));
  },

  async updateReturnRequest(id, fields) {
    const p = await getActivePool();
    const inputs = p.request().input("id", sql.NVarChar, id);
    const assignments = [];
    const columns = { status: ["status", sql.NVarChar], inspectionNote: ["inspection_note", sql.NVarChar], resolutionNote: ["resolution_note", sql.NVarChar], refundReference: ["refund_reference", sql.NVarChar] };
    for (const [key, [column, type]] of Object.entries(columns)) {
      if (fields[key] !== undefined) { inputs.input(key, type, fields[key] || null); assignments.push(`${column}=@${key}`); }
    }
    if (fields.received) assignments.push("return_received_at=GETDATE()");
    if (!assignments.length) throw new Error("No return request fields were provided.");
    await inputs.query(`UPDATE ReturnRequests SET ${assignments.join(",")},updated_at=GETDATE() WHERE id=@id`);
    const updated = await this.getReturnRequestById(id);
    if (!updated) throw new Error("Return request not found.");
    return updated;
  },

  async processReturnRefund({ requestId, refundedBy, refundReference = null, note = "" }) {
    const p = await getActivePool();
    const tx = new sql.Transaction(p);
    await tx.begin();
    try {
      const requestResult = await tx.request().input("id", sql.NVarChar, requestId).query("SELECT * FROM ReturnRequests WITH (UPDLOCK,ROWLOCK) WHERE id=@id");
      const returnRequest = requestResult.recordset[0];
      if (!returnRequest || returnRequest.status !== "inspection_passed") throw new Error("A passed physical inspection is required before refunding.");
      if (returnRequest.request_type !== "refund") throw new Error("This request is not a refund request.");
      const paymentResult = await tx.request().input("order_id", sql.NVarChar, returnRequest.order_id).query("SELECT * FROM Payments WITH (UPDLOCK,ROWLOCK) WHERE order_id=@order_id");
      const payment = paymentResult.recordset[0];
      if (!payment || !["paid", "refund_pending"].includes(payment.payment_status)) throw new Error("The order has no refundable captured payment.");
      const priorResult = await tx.request().input("order_item_id", sql.Int, returnRequest.order_item_id).input("request_id", sql.NVarChar, requestId)
        .query("SELECT COALESCE(SUM(requested_amount),0) AS refunded_amount FROM ReturnRequests WHERE order_item_id=@order_item_id AND id<>@request_id AND status='refunded'");
      const alreadyRefunded = Number(priorResult.recordset[0]?.refunded_amount || 0);
      const orderItemResult = await tx.request().input("id", sql.Int, returnRequest.order_item_id).query("SELECT final_line_total,total_price FROM OrderItems WHERE id=@id");
      const maxAmount = Number(orderItemResult.recordset[0]?.final_line_total ?? orderItemResult.recordset[0]?.total_price ?? 0);
      if (Number(returnRequest.requested_amount) + alreadyRefunded > maxAmount) throw new Error("The requested refund exceeds the remaining value of this item.");
      const totalForOrderResult = await tx.request().input("order_id", sql.NVarChar, returnRequest.order_id).query("SELECT COALESCE(SUM(requested_amount),0) AS amount FROM ReturnRequests WHERE order_id=@order_id AND status='refunded'");
      const alreadyOrderRefunded = Number(totalForOrderResult.recordset[0]?.amount || 0);
      const orderTotal = Number(payment.amount || 0);
      const newTotal = alreadyOrderRefunded + Number(returnRequest.requested_amount);
      const isFullRefund = newTotal >= orderTotal;
      const reference = refundReference || `RET-${requestId}`;
      if (isFullRefund) {
        await tx.request().input("order_id", sql.NVarChar, returnRequest.order_id).input("by", sql.NVarChar, refundedBy).input("reference", sql.NVarChar, reference).input("note", sql.NVarChar, note || "Refund after physical return inspection.")
          .query("UPDATE Payments SET payment_status='refunded',refunded_at=GETDATE(),refunded_by=@by,refund_reference=@reference,refund_note=@note,updated_at=GETDATE() WHERE order_id=@order_id");
      }
      await restoreReturnedInventory(tx, returnRequest, refundedBy, requestId, "return_restock");
      await tx.request().input("id", sql.NVarChar, requestId).input("reference", sql.NVarChar, reference).input("note", sql.NVarChar, note || null)
        .query("UPDATE ReturnRequests SET status='refunded',refund_reference=@reference,resolution_note=@note,updated_at=GETDATE() WHERE id=@id");
      // A refunded purchase can no longer support a verified-product review.
      await tx.request().input("order_item_id", sql.Int, returnRequest.order_item_id)
        .query("UPDATE ProductReviews SET status='deleted',updated_at=GETDATE() WHERE order_item_id=@order_item_id AND status<>'deleted'");
      await tx.request().input("order_id", sql.NVarChar, returnRequest.order_id).input("note", sql.NVarChar, `Return request ${requestId} refunded: ${returnRequest.requested_amount}. ${note || ""}`.slice(0,500)).input("by", sql.NVarChar, refundedBy)
        .query("INSERT INTO OrderStatusHistory(order_id,previous_status,new_status,note,updated_by,created_at) SELECT @order_id,order_status,order_status,@note,@by,GETDATE() FROM Orders WHERE id=@order_id");
      await tx.commit();
      return this.getReturnRequestById(requestId);
    } catch (err) { await tx.rollback(); throw err; }
  },

  async processReturnExchange({ requestId, processedBy, note = "" }) {
    const p = await getActivePool();
    const tx = new sql.Transaction(p);
    await tx.begin();
    try {
      const requestResult = await tx.request().input("id", sql.NVarChar, requestId)
        .query("SELECT * FROM ReturnRequests WITH (UPDLOCK,ROWLOCK) WHERE id=@id");
      const returnRequest = requestResult.recordset[0];
      if (!returnRequest || returnRequest.status !== "inspection_passed") throw new Error("A passed physical inspection is required before completing an exchange.");
      if (returnRequest.request_type !== "exchange") throw new Error("This request is not an exchange request.");

      const itemResult = await tx.request().input("id", sql.Int, returnRequest.order_item_id)
        .query("SELECT id,product_id,variant_id,variant_sku,selected_color,selected_size,quantity FROM OrderItems WITH (UPDLOCK,ROWLOCK) WHERE id=@id");
      const item = itemResult.recordset[0];
      const quantity = Number(returnRequest.requested_quantity || 0);
      if (!item || !Number.isInteger(quantity) || quantity < 1 || quantity > Number(item.quantity)) throw new Error("The requested exchange quantity is invalid.");

      // Lock every variant of this product while selecting the two physical SKUs.
      // This prevents concurrent checkouts/exchanges from overselling the replacement SKU.
      const variantsResult = await tx.request().input("product_id", sql.Int, item.product_id).query(`
        SELECT id,product_id,sku,color_name,size_name,stock_quantity,is_active
        FROM ProductVariants WITH (UPDLOCK,HOLDLOCK)
        WHERE product_id=@product_id`);
      const variants = variantsResult.recordset;
      const originalVariant = item.variant_id
        ? variants.find((variant) => variant.id === item.variant_id)
        : variants.find((variant) => variant.color_name === item.selected_color && variant.size_name === item.selected_size);
      const replacementVariant = variants.find((variant) => variant.is_active && variant.color_name === returnRequest.exchange_color && variant.size_name === returnRequest.exchange_size);
      if (!originalVariant) throw new Error("The original SKU could not be found for this returned item. Please correct inventory manually before completing the exchange.");
      if (!replacementVariant) throw new Error("The requested replacement size or colour is no longer available.");
      if (Number(replacementVariant.stock_quantity) + (replacementVariant.id === originalVariant.id ? quantity : 0) < quantity) {
        throw new Error("The requested replacement SKU no longer has sufficient stock.");
      }

      await restoreReturnedInventory(tx, returnRequest, processedBy, requestId, "return_restock", { item, originalVariant });

      const replacementUpdate = await tx.request()
        .input("variant_id", sql.NVarChar, replacementVariant.id)
        .input("qty", sql.Int, quantity)
        .query("UPDATE ProductVariants SET stock_quantity=stock_quantity-@qty,updated_at=GETDATE() WHERE id=@variant_id; SELECT stock_quantity FROM ProductVariants WHERE id=@variant_id;");
      const replacementStock = Number(replacementUpdate.recordset[0].stock_quantity);
      const productUpdate = await tx.request().input("product_id", sql.Int, item.product_id).input("qty", sql.Int, quantity)
        .query("UPDATE Products SET stock=stock-@qty,updated_at=GETDATE() WHERE id=@product_id; SELECT stock FROM Products WHERE id=@product_id;");
      const resultingProductStock = Number(productUpdate.recordset[0].stock);
      await tx.request()
        .input("product_id", sql.Int, item.product_id)
        .input("variant_id", sql.NVarChar, replacementVariant.id)
        .input("movement_type", sql.NVarChar, "exchange_deduction")
        .input("quantity_change", sql.Int, -quantity)
        .input("resulting_stock", sql.Int, resultingProductStock)
        .input("reference_id", sql.NVarChar, requestId)
        .input("note", sql.NVarChar, `Replacement dispatched for exchange ${requestId}: ${replacementVariant.sku} (${replacementVariant.color_name} / ${replacementVariant.size_name}); variant stock after dispatch: ${replacementStock}`)
        .input("performed_by", sql.NVarChar, processedBy)
        .query(`INSERT INTO InventoryMovements(product_id,variant_id,movement_type,quantity_change,resulting_stock,reference_id,note,performed_by,created_at)
          VALUES(@product_id,@variant_id,@movement_type,@quantity_change,@resulting_stock,@reference_id,@note,@performed_by,GETDATE())`);
      await tx.request().input("id", sql.NVarChar, requestId).input("note", sql.NVarChar, note || "Exchange arranged by Maison Rue.")
        .query("UPDATE ReturnRequests SET status='exchanged',resolution_note=@note,updated_at=GETDATE() WHERE id=@id");
      await tx.request().input("order_id", sql.NVarChar, returnRequest.order_id).input("note", sql.NVarChar, `Return request ${requestId} exchanged: returned ${originalVariant.sku}; dispatched ${replacementVariant.sku}. ${note || ""}`.slice(0, 500)).input("by", sql.NVarChar, processedBy)
        .query("INSERT INTO OrderStatusHistory(order_id,previous_status,new_status,note,updated_by,created_at) SELECT @order_id,order_status,order_status,@note,@by,GETDATE() FROM Orders WHERE id=@order_id");
      await tx.commit();
      return this.getReturnRequestById(requestId);
    } catch (err) { await tx.rollback(); throw err; }
  },

  async createOrderWithTransaction({ orderData, items, paymentData, promotionData = null }) {
    const p = await getActivePool();
    const transaction = new sql.Transaction(p);
    const lowStockAlerts = [];
    await transaction.begin();
    try {
      // 1. Check stock availability for all items
      for (const item of items) {
        if (item.variantId) {
          const variantRes = await transaction.request()
            .input("variant_id", sql.NVarChar, item.variantId)
            .query(`SELECT v.id, v.sku, v.stock_quantity,v.reserved_quantity,v.quarantine_quantity
              FROM ProductVariants v WITH (UPDLOCK, ROWLOCK)
              JOIN Products p ON p.id=v.product_id
              WHERE v.id=@variant_id AND v.is_active=1 AND ${activeProductSql("p")}`);
          const variant = variantRes.recordset[0];
          const available = variant ? Number(variant.stock_quantity || 0) - Number(variant.reserved_quantity || 0) - Number(variant.quarantine_quantity || 0) : 0;
          if (!variant || available < item.quantity) {
            throw new Error(`Biến thể ${item.sku || item.variantId} không đủ tồn kho.`);
          }
          continue;
        }
        const prodRes = await transaction
          .request()
          .input("id", sql.Int, item.id)
          .query(`SELECT p.id, p.name, p.stock FROM Products p WHERE p.id = @id AND ${activeProductSql("p")}`);
        const prod = prodRes.recordset[0];
        if (!prod || prod.stock < item.quantity) {
          throw new Error(`Sản phẩm "${item.name}" chỉ còn ${prod ? prod.stock : 0} trong kho.`);
        }
      }

      // 2. Insert Order
      await transaction
        .request()
        .input("id", sql.NVarChar, orderData.id)
        .input("customer_id", sql.NVarChar, orderData.customer_id)
        .input("customer_name", sql.NVarChar, orderData.customer_name)
        .input("customer_email", sql.NVarChar, orderData.customer_email)
        .input("customer_phone", sql.NVarChar, orderData.customer_phone)
        .input("shipping_address", sql.NVarChar, orderData.shipping_address)
        .input("shipping_fee", sql.Decimal(18, 0), orderData.shipping_fee || 0)
        .input("total_amount", sql.Decimal(18, 0), orderData.total_amount)
        .input("original_subtotal", sql.Decimal(18, 0), orderData.original_subtotal ?? orderData.total_amount)
        .input("product_discount_total", sql.Decimal(18, 0), orderData.product_discount_total || 0)
        .input("code_discount_total", sql.Decimal(18, 0), orderData.code_discount_total || 0)
        .input("shipping_fee_original", sql.Decimal(18, 0), orderData.shipping_fee_original || orderData.shipping_fee || 0)
        .input("shipping_discount_total", sql.Decimal(18, 0), orderData.shipping_discount_total || 0)
        .input("promotion_code", sql.NVarChar, orderData.promotion_code || null)
        .input("promotion_snapshot_json", sql.NVarChar, orderData.promotion_snapshot_json || null)
        .input("order_status", sql.NVarChar, "pending")
        .input("stock_deducted", sql.Bit, 0)
        .input("notes", sql.NVarChar, orderData.notes || null)
        .query(`
          INSERT INTO Orders (id, customer_id, customer_name, customer_email, customer_phone, shipping_address, shipping_fee, total_amount,original_subtotal,product_discount_total,code_discount_total,shipping_fee_original,shipping_discount_total,promotion_code,promotion_snapshot_json, order_status, stock_deducted, notes, created_at, updated_at)
          VALUES (@id, @customer_id, @customer_name, @customer_email, @customer_phone, @shipping_address, @shipping_fee, @total_amount,@original_subtotal,@product_discount_total,@code_discount_total,@shipping_fee_original,@shipping_discount_total,@promotion_code,@promotion_snapshot_json, @order_status, @stock_deducted, @notes, GETDATE(), GETDATE())
        `);

      // 3. Insert OrderItems & Deduct stock & Record movements
      for (const item of items) {
        await transaction
          .request()
          .input("order_id", sql.NVarChar, orderData.id)
          .input("product_id", sql.Int, item.id)
          .input("product_name", sql.NVarChar, item.name)
          .input("selected_color", sql.NVarChar, item.selectedColor || "Tiêu chuẩn")
          .input("selected_size", sql.NVarChar, item.selectedSize || "ONE SIZE")
          .input("variant_id", sql.NVarChar, item.variantId || null)
          .input("variant_sku", sql.NVarChar, item.sku || null)
          .input("quantity", sql.Int, item.quantity)
          .input("unit_price", sql.Decimal(18, 0), item.price)
          .input("total_price", sql.Decimal(18, 0), item.price * item.quantity)
          .input("original_unit_price", sql.Decimal(18, 0), item.originalUnitPrice ?? item.price)
          .input("unit_cost_snapshot", sql.Decimal(18, 0), item.costPrice || null)
          .input("automatic_discount_total", sql.Decimal(18, 0), item.automaticDiscount || 0)
          .input("order_discount_allocated", sql.Decimal(18, 0), item.orderDiscountAllocated || 0)
          .input("final_line_total", sql.Decimal(18, 0), item.finalLineTotal ?? item.price * item.quantity)
          .input("promotion_snapshot_json", sql.NVarChar, item.automaticPromotion ? JSON.stringify({ id: item.automaticPromotion.id, name: item.automaticPromotion.name, type: item.automaticPromotion.discount_type, value: item.automaticPromotion.discount_value }) : null)
          .input("image_url", sql.NVarChar, item.image || null)
          .query(`
            INSERT INTO OrderItems (order_id, product_id, product_name, selected_color, selected_size, variant_id, variant_sku, quantity, unit_price, total_price, image_url,original_unit_price,unit_cost_snapshot,automatic_discount_total,order_discount_allocated,final_line_total,promotion_snapshot_json, created_at)
            VALUES (@order_id, @product_id, @product_name, @selected_color, @selected_size, @variant_id, @variant_sku, @quantity, @unit_price, @total_price, @image_url,@original_unit_price,@unit_cost_snapshot,@automatic_discount_total,@order_discount_allocated,@final_line_total,@promotion_snapshot_json, GETDATE())
          `);

        let skuStock = null;
        if (item.variantId) {
          const varUpdate = await transaction.request().input("variant_id", sql.NVarChar, item.variantId).input("qty", sql.Int, item.quantity)
            .query(`UPDATE ProductVariants SET reserved_quantity=reserved_quantity+@qty,updated_at=GETDATE() WHERE id=@variant_id;
                    SELECT id,sku,stock_quantity,reserved_quantity,quarantine_quantity,low_stock_threshold,color_name,size_name FROM ProductVariants WHERE id=@variant_id;`);
          skuStock = Number(varUpdate.recordset?.[0]?.stock_quantity || 0);
        }
        const updatedProd = await transaction.request().input("id", sql.Int, item.id).query("SELECT stock FROM Products WHERE id = @id");

        await transaction
          .request()
          .input("product_id", sql.Int, item.id)
          .input("variant_id", sql.NVarChar, item.variantId || null)
          .input("movement_type", sql.NVarChar, "order_reservation")
          .input("quantity_change", sql.Int, 0)
          .input("resulting_stock", sql.Int, skuStock ?? updatedProd.recordset[0].stock)
          .input("reference_id", sql.NVarChar, orderData.id)
          .input("note", sql.NVarChar, `Giữ ${item.quantity} sản phẩm cho đơn #${orderData.id}`)
          .input("performed_by", sql.NVarChar, orderData.customer_name)
          .query(`
            INSERT INTO InventoryMovements (product_id, variant_id, movement_type, quantity_change, resulting_stock, reference_id, note, performed_by, created_at)
            VALUES (@product_id, @variant_id, @movement_type, @quantity_change, @resulting_stock, @reference_id, @note, @performed_by, GETDATE())
          `);
      }

      if (promotionData) {
        const appliedMap = new Map(promotionData.automaticPromotions.map((promotion) => [promotion.id, { promotion, code: null }]));
        if (promotionData.codePromotion) appliedMap.set(promotionData.codePromotion.id, { promotion: promotionData.codePromotion, code: promotionData.codePromotion });
        const applied = [...appliedMap.values()];
        for (const entry of applied) {
          const locked = await transaction.request().input("id", sql.Int, entry.promotion.id).query("SELECT id,usage_limit_total,usage_limit_per_customer,used_count,budget_total,budget_reserved,budget_spent,approval_status FROM Promotions WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND status='active' AND approval_status='approved' AND is_archived=0 AND start_at<=SYSUTCDATETIME() AND (end_at IS NULL OR end_at>SYSUTCDATETIME())");
          if (!locked.recordset.length || (locked.recordset[0].usage_limit_total && locked.recordset[0].used_count >= locked.recordset[0].usage_limit_total)) throw new Error("Chương trình khuyến mãi vừa hết hiệu lực hoặc hết lượt sử dụng.");
          if (locked.recordset[0].usage_limit_per_customer && orderData.customer_id) {
            const usedByCustomer = await transaction.request().input("promotion_id", sql.Int, entry.promotion.id).input("customer_id", sql.NVarChar, orderData.customer_id).query("SELECT COUNT(*) total FROM PromotionUsages WITH (UPDLOCK,HOLDLOCK) WHERE promotion_id=@promotion_id AND customer_id=@customer_id AND status='consumed'");
            if (usedByCustomer.recordset[0].total >= locked.recordset[0].usage_limit_per_customer) throw new Error("Bạn vừa đạt giới hạn sử dụng của chương trình này.");
          }
          if (entry.code) {
            const codeLock = await transaction.request().input("id", sql.Int, entry.code.promotion_code_id).query("SELECT id,usage_limit,used_count FROM PromotionCodes WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND is_active=1");
            if (!codeLock.recordset.length || (codeLock.recordset[0].usage_limit && codeLock.recordset[0].used_count >= codeLock.recordset[0].usage_limit)) throw new Error("Mã giảm giá vừa hết lượt sử dụng.");
            await transaction.request().input("id", sql.Int, entry.code.promotion_code_id).query("UPDATE PromotionCodes SET used_count=used_count+1,updated_at=GETDATE() WHERE id=@id");
          }
          const itemDiscount = promotionData.items.filter((item) => item.automaticPromotion?.id === entry.promotion.id).reduce((sum, item) => sum + item.automaticDiscount, 0);
          const discountAmount = entry.code ? promotionData.codeDiscountTotal : itemDiscount;
          const shippingAmount = entry.code ? promotionData.shippingDiscountTotal : 0;
          const budgetAmount = Number(discountAmount || 0) + Number(shippingAmount || 0);
          const budgetTotal = Number(locked.recordset[0].budget_total || 0);
          const budgetUsed = Number(locked.recordset[0].budget_reserved || 0) + Number(locked.recordset[0].budget_spent || 0);
          if (budgetTotal && budgetUsed + budgetAmount > budgetTotal) throw new Error("Ngân sách chương trình không còn đủ cho đơn hàng này.");
          await transaction.request().input("id", sql.Int, entry.promotion.id).input("budget", sql.Decimal(18,0), budgetAmount).query("UPDATE Promotions SET used_count=used_count+1,budget_reserved=budget_reserved+@budget,updated_at=GETDATE() WHERE id=@id");
          await transaction.request().input("promotion_id", sql.Int, entry.promotion.id).input("code_id", sql.Int, entry.code?.promotion_code_id || null).input("order_id", sql.NVarChar, orderData.id).input("customer_id", sql.NVarChar, orderData.customer_id).input("discount", sql.Decimal(18,0), discountAmount).input("shipping", sql.Decimal(18,0), shippingAmount).input("budget", sql.Decimal(18,0), budgetAmount).query("INSERT INTO PromotionUsages(promotion_id,promotion_code_id,order_id,customer_id,discount_amount,shipping_discount,status,budget_status,budget_amount) VALUES(@promotion_id,@code_id,@order_id,@customer_id,@discount,@shipping,'consumed','reserved',@budget)");
          if (entry.code?.promotion_code_id && orderData.customer_id) await transaction.request().input("code_id",sql.Int,entry.code.promotion_code_id).input("user_id",sql.NVarChar,orderData.customer_id).query("UPDATE PromotionCodeAssignments SET status='used',used_at=GETDATE() WHERE promotion_code_id=@code_id AND user_id=@user_id AND status='available'");
        }
      }

      // 4. Initial Status History
      await transaction
        .request()
        .input("order_id", sql.NVarChar, orderData.id)
        .input("previous_status", sql.NVarChar, null)
        .input("new_status", sql.NVarChar, "pending")
        .input("note", sql.NVarChar, "Đơn hàng đã được tạo thành công.")
        .input("updated_by", sql.NVarChar, `${orderData.customer_name} (Khách hàng)`)
        .query(`
          INSERT INTO OrderStatusHistory (order_id, previous_status, new_status, note, updated_by, created_at)
          VALUES (@order_id, @previous_status, @new_status, @note, @updated_by, GETDATE())
        `);

      // 5. Payment Record
      await transaction
        .request()
        .input("order_id", sql.NVarChar, orderData.id)
        .input("payment_method", sql.NVarChar, paymentData.method || "cod")
        .input("amount", sql.Decimal(18, 0), orderData.total_amount)
        .input("payment_status", sql.NVarChar, "unpaid")
        .query(`
          INSERT INTO Payments (order_id, payment_method, amount, payment_status, created_at, updated_at)
          VALUES (@order_id, @payment_method, @amount, @payment_status, GETDATE(), GETDATE())
        `);

      await transaction.commit();
      const finalOrder = await this.getOrderById(orderData.id);
      if (finalOrder) finalOrder.lowStockAlerts = lowStockAlerts;
      return finalOrder;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async updateOrderStatusWithValidation({ orderId, newStatus, note, updatedBy }) {
    const VALID_TRANSITIONS = {
      pending: ["confirmed", "cancelled"],
      confirmed: ["processing", "cancelled"],
      processing: ["shipping", "cancelled"],
      shipping: ["delivered"],
      delivered: [],
      cancelled: [],
    };

    const p = await getActivePool();
    const currentOrder = await this.getOrderById(orderId);
    if (!currentOrder) {
      throw new Error(`Đơn hàng #${orderId} không tồn tại.`);
    }

    const currentStatus = currentOrder.order_status;
    const allowed = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Không thể chuyển trạng thái từ "${currentStatus}" sang "${newStatus}".`);
    }

    const transaction = new sql.Transaction(p);
    await transaction.begin();
    try {
      let stockDeducted = currentOrder.stock_deducted;

      // A new order reserves sellable units. Physical stock leaves the warehouse
      // only when staff starts preparing it.
      if (newStatus === "processing" && !stockDeducted) {
        for (const item of currentOrder.items) {
          if (!item.variant_id) throw new Error(`Đơn ${orderId} có sản phẩm chưa gắn SKU nên không thể xuất kho tự động.`);
          const variantResult = await transaction.request()
            .input("variant_id", sql.NVarChar, item.variant_id)
            .query(`SELECT id,sku,stock_quantity,reserved_quantity FROM ProductVariants WITH (UPDLOCK,ROWLOCK) WHERE id=@variant_id AND is_active=1`);
          const variant = variantResult.recordset[0];
          if (!variant || Number(variant.stock_quantity) < Number(item.quantity)) throw new Error(`SKU ${item.variant_sku || item.variant_id} không đủ tồn thực tế để xuất.`);
          if (Number(variant.reserved_quantity) < Number(item.quantity)) throw new Error(`SKU ${item.variant_sku || item.variant_id} không còn đủ số lượng đang giữ cho đơn.`);
          const skuAfter = Number(variant.stock_quantity) - Number(item.quantity);
          await transaction.request().input("variant_id", sql.NVarChar, item.variant_id).input("qty", sql.Int, item.quantity)
            .query("UPDATE ProductVariants SET stock_quantity=stock_quantity-@qty,reserved_quantity=reserved_quantity-@qty,updated_at=GETDATE() WHERE id=@variant_id");
          const totalResult = await transaction.request().input("product_id", sql.Int, item.product_id)
            .query("SELECT COALESCE(SUM(stock_quantity),0) total FROM ProductVariants WHERE product_id=@product_id AND is_active=1");
          const productAfter = Number(totalResult.recordset[0].total);
          await transaction.request().input("product_id", sql.Int, item.product_id).input("stock", sql.Int, productAfter)
            .query("UPDATE Products SET stock=@stock,updated_at=GETDATE() WHERE id=@product_id");
          await transaction.request()
            .input("product_id", sql.Int, item.product_id).input("variant_id", sql.NVarChar, item.variant_id)
            .input("movement_type", sql.NVarChar, "order_deduction").input("change", sql.Int, -Number(item.quantity))
            .input("resulting", sql.Int, skuAfter).input("reference", sql.NVarChar, orderId)
            .input("note", sql.NVarChar, `Xuất SKU cho đơn #${orderId}`).input("actor", sql.NVarChar, updatedBy)
            .input("before", sql.Int, Number(variant.stock_quantity)).input("after", sql.Int, skuAfter).input("product_after", sql.Int, productAfter)
            .query(`INSERT INTO InventoryMovements(product_id,variant_id,movement_type,quantity_change,resulting_stock,reference_id,note,performed_by,created_at,
                      reason_code,quantity_before,quantity_after,product_stock_after,reference_type)
                    VALUES(@product_id,@variant_id,@movement_type,@change,@resulting,@reference,@note,@actor,GETDATE(),
                      'order_fulfillment',@before,@after,@product_after,'order')`);
        }
        stockDeducted = true;
      }

      // After warehouse picking, cancellation must not make merchandise sellable
      // again. The physical return workflow receives and inspects it separately.
      if (newStatus === "cancelled" && stockDeducted) {
        for (const item of currentOrder.items) {
          const currentVariant = item.variant_id
            ? await transaction.request().input("variant_id", sql.NVarChar, item.variant_id)
                .query("SELECT stock_quantity,reserved_quantity,quarantine_quantity FROM ProductVariants WHERE id=@variant_id")
            : { recordset: [] };
          const state = currentVariant.recordset[0];
          const physical = Number(state?.stock_quantity || 0);
          const reserved = Number(state?.reserved_quantity || 0);
          const quarantine = Number(state?.quarantine_quantity || 0);
          const available = Math.max(0, physical - reserved - quarantine);
          await transaction
            .request()
            .input("product_id", sql.Int, item.product_id)
            .input("variant_id", sql.NVarChar, item.variant_id || null)
            .input("movement_type", sql.NVarChar, "order_cancelled_awaiting_return")
            .input("quantity_change", sql.Int, 0)
            .input("resulting_stock", sql.Int, physical)
            .input("reference_id", sql.NVarChar, orderId)
            .input("note", sql.NVarChar, `Đơn #${orderId} bị hủy sau khi xuất kho; chờ quy trình nhận hàng trả lại và kiểm tra.`)
            .input("performed_by", sql.NVarChar, updatedBy)
            .input("available", sql.Int, available)
            .input("reserved", sql.Int, reserved)
            .input("quarantine", sql.Int, quarantine)
            .query(`
              INSERT INTO InventoryMovements (product_id,variant_id,movement_type,quantity_change,resulting_stock,reference_id,note,performed_by,created_at,
                reason_code,quantity_before,quantity_after,reference_type,available_before,available_after,reserved_before,reserved_after,quarantine_before,quarantine_after)
              VALUES (@product_id,@variant_id,@movement_type,@quantity_change,@resulting_stock,@reference_id,@note,@performed_by,GETDATE(),
                'cancelled_after_fulfillment',@resulting_stock,@resulting_stock,'order',@available,@available,@reserved,@reserved,@quarantine,@quarantine)
            `);
        }
      }

      // Before warehouse picking, cancellation only releases the reservation;
      // physical stock has never left the warehouse.
      if (newStatus === "cancelled" && !stockDeducted) {
        for (const item of currentOrder.items) {
          if (!item.variant_id) continue;
          const reservedResult = await transaction.request().input("variant_id", sql.NVarChar, item.variant_id)
            .query("SELECT stock_quantity,reserved_quantity FROM ProductVariants WITH (UPDLOCK,ROWLOCK) WHERE id=@variant_id");
          const reserved = Number(reservedResult.recordset[0]?.reserved_quantity || 0);
          const release = Math.min(reserved, Number(item.quantity));
          if (release <= 0) continue;
          const skuStock = Number(reservedResult.recordset[0].stock_quantity || 0);
          await transaction.request().input("variant_id", sql.NVarChar, item.variant_id).input("qty", sql.Int, release)
            .query("UPDATE ProductVariants SET reserved_quantity=reserved_quantity-@qty,updated_at=GETDATE() WHERE id=@variant_id");
          await transaction.request().input("product_id", sql.Int, item.product_id).input("variant_id", sql.NVarChar, item.variant_id)
            .input("movement_type", sql.NVarChar, "reservation_release").input("resulting", sql.Int, skuStock)
            .input("reference", sql.NVarChar, orderId).input("note", sql.NVarChar, `Giải phóng ${release} sản phẩm do hủy đơn #${orderId}`)
            .input("actor", sql.NVarChar, updatedBy)
            .query(`INSERT INTO InventoryMovements(product_id,variant_id,movement_type,quantity_change,resulting_stock,reference_id,note,performed_by,created_at,reason_code,quantity_before,quantity_after,reference_type)
                    VALUES(@product_id,@variant_id,@movement_type,0,@resulting,@reference,@note,@actor,GETDATE(),'order_cancelled',@resulting,@resulting,'order')`);
        }
      }

      if (newStatus === "cancelled") {
        const usages = await transaction.request().input("order_id", sql.NVarChar, orderId).query("SELECT id,promotion_id,promotion_code_id,budget_amount,budget_status FROM PromotionUsages WITH (UPDLOCK,HOLDLOCK) WHERE order_id=@order_id AND status='consumed'");
        for (const usage of usages.recordset) {
          await transaction.request().input("id", sql.BigInt, usage.id).input("released_by", sql.NVarChar, updatedBy).query("UPDATE PromotionUsages SET status='released',released_at=GETDATE(),released_by=@released_by,release_reason=N'Đơn hàng bị hủy trước khi giao' WHERE id=@id");
          await transaction.request().input("id", sql.Int, usage.promotion_id).input("budget", sql.Decimal(18,0), usage.budget_amount || 0).query(`UPDATE Promotions SET used_count=CASE WHEN used_count>0 THEN used_count-1 ELSE 0 END,
            budget_reserved=CASE WHEN @budget<=budget_reserved THEN budget_reserved-@budget ELSE 0 END,
            budget_spent=CASE WHEN '${usage.budget_status}'='spent' AND @budget<=budget_spent THEN budget_spent-@budget ELSE budget_spent END,updated_at=GETDATE() WHERE id=@id`);
          if (usage.promotion_code_id) {
            await transaction.request().input("id", sql.Int, usage.promotion_code_id).query("UPDATE PromotionCodes SET used_count=CASE WHEN used_count>0 THEN used_count-1 ELSE 0 END,updated_at=GETDATE() WHERE id=@id");
            await transaction.request().input("code_id",sql.Int,usage.promotion_code_id).input("user_id",sql.NVarChar,currentOrder.customer_id).query("UPDATE PromotionCodeAssignments SET status='available',used_at=NULL WHERE promotion_code_id=@code_id AND user_id=@user_id AND status='used'");
          }
        }
      }

      if (newStatus === "delivered") {
        const usages = await transaction.request().input("order_id", sql.NVarChar, orderId).query("SELECT id,promotion_id,budget_amount FROM PromotionUsages WITH (UPDLOCK,HOLDLOCK) WHERE order_id=@order_id AND status='consumed' AND budget_status='reserved'");
        for (const usage of usages.recordset) {
          await transaction.request().input("id", sql.Int, usage.promotion_id).input("budget", sql.Decimal(18,0), usage.budget_amount || 0).query("UPDATE Promotions SET budget_reserved=CASE WHEN @budget<=budget_reserved THEN budget_reserved-@budget ELSE 0 END,budget_spent=budget_spent+@budget,updated_at=GETDATE() WHERE id=@id");
          await transaction.request().input("id", sql.BigInt, usage.id).query("UPDATE PromotionUsages SET budget_status='spent' WHERE id=@id");
        }
      }

      await transaction
        .request()
        .input("id", sql.NVarChar, orderId)
        .input("order_status", sql.NVarChar, newStatus)
        .input("stock_deducted", sql.Bit, stockDeducted ? 1 : 0)
        .query(`UPDATE Orders
          SET order_status = @order_status,
              stock_deducted = @stock_deducted,
              delivered_at = CASE WHEN @order_status='delivered' THEN GETDATE() ELSE delivered_at END,
              recognized_at = CASE WHEN @order_status='delivered'
                AND EXISTS (SELECT 1 FROM Payments WHERE order_id=@id AND payment_status='paid')
                THEN GETDATE() ELSE recognized_at END,
              updated_at = GETDATE()
          WHERE id = @id`);

      // Order status and payment status are strictly independent.
      // Moving to 'delivered' DOES NOT automatically mark payment as 'paid'.
      // Handling cancellation:
      if (newStatus === "cancelled") {
        const pmtRes = await transaction
          .request()
          .input("order_id", sql.NVarChar, orderId)
          .query("SELECT payment_status FROM Payments WHERE order_id = @order_id");
        const currentPmtStatus = pmtRes.recordset[0]?.payment_status;

        if (currentPmtStatus === "paid") {
          // If customer already paid, cancelling initiates the refund workflow: refund_pending
          await transaction
            .request()
            .input("order_id", sql.NVarChar, orderId)
            .query(`
              UPDATE Payments 
              SET payment_status = 'refund_pending', updated_at = GETDATE() 
              WHERE order_id = @order_id
            `);
        } else if (currentPmtStatus === "unpaid" || currentPmtStatus === "pending_verification") {
          // If order was unpaid, cancelling it marks payment as 'cancelled', NEVER 'refunded'!
          await transaction
            .request()
            .input("order_id", sql.NVarChar, orderId)
            .query(`
              UPDATE Payments 
              SET payment_status = 'cancelled', updated_at = GETDATE() 
              WHERE order_id = @order_id
            `);
        }
      }

      await transaction
        .request()
        .input("order_id", sql.NVarChar, orderId)
        .input("previous_status", sql.NVarChar, currentStatus)
        .input("new_status", sql.NVarChar, newStatus)
        .input("note", sql.NVarChar, note || `Cập nhật sang ${newStatus}`)
        .input("updated_by", sql.NVarChar, updatedBy)
        .query(`
          INSERT INTO OrderStatusHistory (order_id, previous_status, new_status, note, updated_by, created_at)
          VALUES (@order_id, @previous_status, @new_status, @note, @updated_by, GETDATE())
        `);

      await transaction.commit();
      return this.getOrderById(orderId);
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  // Explicit payment confirmation (COD collected or Bank Transfer verified)
  async confirmPayment({ orderId, transactionReference = null, note = "", confirmedBy = "system" }) {
    const p = await getActivePool();
    const transaction = new sql.Transaction(p);
    await transaction.begin();

    try {
      const orderRes = await transaction
        .request()
        .input("id", sql.NVarChar, orderId)
        .query("SELECT * FROM Orders WHERE id = @id");
      const order = orderRes.recordset[0];
      if (!order) {
        throw new Error("Không tìm thấy đơn hàng");
      }

      const pmtRes = await transaction
        .request()
        .input("order_id", sql.NVarChar, orderId)
        .query("SELECT * FROM Payments WHERE order_id = @order_id");
      const payment = pmtRes.recordset[0];
      if (!payment) {
        throw new Error("Không tìm thấy thông tin thanh toán của đơn hàng");
      }

      if (payment.payment_status === "paid") {
        throw new Error("Đơn hàng này đã được xác nhận thanh toán trước đó");
      }
      if (payment.payment_status === "refunded") {
        throw new Error("Đơn hàng này đã được hoàn tiền, không thể xác nhận thanh toán");
      }
      if (payment.payment_status === "cancelled") {
        throw new Error("Giao dịch thanh toán đã bị hủy");
      }

      await transaction
        .request()
        .input("order_id", sql.NVarChar, orderId)
        .input("verified_by", sql.NVarChar, confirmedBy)
        .input("transaction_reference", sql.NVarChar, transactionReference || payment.transaction_reference)
        .query(`
          UPDATE Payments 
          SET payment_status = 'paid', 
              verified_at = GETDATE(), 
              verified_by = @verified_by, 
              transaction_reference = @transaction_reference,
              updated_at = GETDATE() 
          WHERE order_id = @order_id
        `);

      if (order.order_status === "delivered") {
        await transaction.request().input("order_id", sql.NVarChar, orderId).query(`
          UPDATE Orders SET recognized_at=COALESCE(recognized_at,GETDATE()), updated_at=GETDATE()
          WHERE id=@order_id
        `);
      }

      const auditNote = note 
        ? `Xác nhận thanh toán thành công: ${note}` 
        : `Xác nhận thanh toán thành công (Mã GD: ${transactionReference || payment.transaction_reference || "N/A"})`;

      await transaction
        .request()
        .input("order_id", sql.NVarChar, orderId)
        .input("previous_status", sql.NVarChar, order.order_status)
        .input("new_status", sql.NVarChar, order.order_status)
        .input("note", sql.NVarChar, auditNote)
        .input("updated_by", sql.NVarChar, confirmedBy)
        .query(`
          INSERT INTO OrderStatusHistory (order_id, previous_status, new_status, note, updated_by, created_at)
          VALUES (@order_id, @previous_status, @new_status, @note, @updated_by, GETDATE())
        `);

      await transaction.commit();
      return this.getOrderById(orderId);
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  // Explicit refund processing
  async processRefund({ orderId, refundReference = null, note = "", refundedBy = "system" }) {
    const p = await getActivePool();
    const transaction = new sql.Transaction(p);
    await transaction.begin();

    try {
      const orderRes = await transaction
        .request()
        .input("id", sql.NVarChar, orderId)
        .query("SELECT * FROM Orders WHERE id = @id");
      const order = orderRes.recordset[0];
      if (!order) {
        throw new Error("Không tìm thấy đơn hàng");
      }

      const pmtRes = await transaction
        .request()
        .input("order_id", sql.NVarChar, orderId)
        .query("SELECT * FROM Payments WHERE order_id = @order_id");
      const payment = pmtRes.recordset[0];
      if (!payment) {
        throw new Error("Không tìm thấy thông tin thanh toán của đơn hàng");
      }

      if (payment.payment_status === "refunded") {
        throw new Error("Khoản thanh toán này đã được hoàn tất thủ tục hoàn tiền trước đó");
      }
      if (payment.payment_status === "unpaid" || payment.payment_status === "cancelled") {
        throw new Error("Đơn hàng chưa thanh toán hoặc đã hủy giao dịch, không có tiền để hoàn trả");
      }
      if (payment.payment_status !== "paid" && payment.payment_status !== "refund_pending") {
        throw new Error(`Trạng thái thanh toán không hợp lệ để hoàn tiền: ${payment.payment_status}`);
      }

      await transaction
        .request()
        .input("order_id", sql.NVarChar, orderId)
        .input("refunded_by", sql.NVarChar, refundedBy)
        .input("refund_reference", sql.NVarChar, refundReference || `REF-${Date.now()}`)
        .input("refund_note", sql.NVarChar, note || "Hoàn tiền theo yêu cầu hủy đơn")
        .query(`
          UPDATE Payments 
          SET payment_status = 'refunded', 
              refunded_at = GETDATE(), 
              refunded_by = @refunded_by, 
              refund_reference = @refund_reference,
              refund_note = @refund_note,
              updated_at = GETDATE() 
          WHERE order_id = @order_id
        `);

      const auditNote = `Hoàn tiền thành công (Mã hoàn tiền: ${refundReference || "N/A"}). Ghi chú: ${note || "N/A"}`;

      await transaction
        .request()
        .input("order_id", sql.NVarChar, orderId)
        .input("previous_status", sql.NVarChar, order.order_status)
        .input("new_status", sql.NVarChar, order.order_status)
        .input("note", sql.NVarChar, auditNote)
        .input("updated_by", sql.NVarChar, refundedBy)
        .query(`
          INSERT INTO OrderStatusHistory (order_id, previous_status, new_status, note, updated_by, created_at)
          VALUES (@order_id, @previous_status, @new_status, @note, @updated_by, GETDATE())
        `);

      await transaction.commit();
      return this.getOrderById(orderId);
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async getInventoryMovements(productId = null) {
    const p = await getActivePool();
    let q = "SELECT * FROM InventoryMovements";
    if (productId) {
      q += " WHERE product_id = @product_id";
      const res = await p
        .request()
        .input("product_id", sql.Int, Number(productId))
        .query(q + " ORDER BY created_at DESC");
      return res.recordset;
    }
    const res = await p.request().query(q + " ORDER BY created_at DESC");
    return res.recordset;
  },

  async getInventoryDocuments(limit = 100) {
    const p = await getActivePool();
    const safeLimit = Math.max(1, Math.min(250, Number(limit) || 100));
    const result = await p.request().input("limit", sql.Int, safeLimit).query(`
      SELECT TOP (@limit) d.*,
        (SELECT COUNT(*) FROM InventoryDocumentItems i WHERE i.document_id=d.id) AS item_count,
        (SELECT COALESCE(SUM(ABS(i.quantity_change)),0) FROM InventoryDocumentItems i WHERE i.document_id=d.id) AS total_quantity
      FROM InventoryDocuments d
      ORDER BY d.created_at DESC, d.id DESC
    `);
    return result.recordset;
  },

  async createInventoryDocument(data, actor = "Staff") {
    const p = await getActivePool();
    const type = String(data.documentType || "").trim();
    const allowedTypes = new Set(["receipt", "stocktake", "quarantine", "release", "special_adjustment"]);
    if (!allowedTypes.has(type)) throw new Error("Loại nghiệp vụ kho không hợp lệ.");
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) throw new Error("Phiếu kho phải có ít nhất một SKU.");
    if (String(data.note || "").trim().length < 5) throw new Error("Vui lòng nhập lý do hoặc ghi chú tối thiểu 5 ký tự.");

    if (type === "receipt" && String(data.supplierName || "").trim().length < 2) {
      throw new Error("Phiếu nhập hàng cần có tên nhà cung cấp.");
    }
    const transaction = new sql.Transaction(p);
    await transaction.begin();
    try {
      const documentCode = `INV-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${Date.now().toString().slice(-7)}`;
      const documentResult = await transaction.request()
        .input("document_code", sql.NVarChar, documentCode)
        .input("document_type", sql.NVarChar, type)
        .input("reference_id", sql.NVarChar, data.referenceId || data.referenceNumber || data.externalReference || null)
        .input("external_reference", sql.NVarChar, data.externalReference || data.referenceNumber || data.referenceId || null)
        .input("supplier_name", sql.NVarChar, data.supplierName || null)
        .input("note", sql.NVarChar, String(data.note).trim())
        .input("created_by", sql.NVarChar, actor)
        .query(`INSERT INTO InventoryDocuments(document_code,document_type,status,reference_id,external_reference,supplier_name,note,created_by,approved_by,completed_at)
                OUTPUT inserted.id,inserted.document_code
                VALUES(@document_code,@document_type,'completed',@reference_id,@external_reference,@supplier_name,@note,@created_by,@created_by,GETDATE())`);
      const document = documentResult.recordset[0];

      for (const input of items) {
        const productId = Number(input.productId);
        const variantId = String(input.variantId || "");
        const quantity = Number.parseInt(input.actualQuantity ?? input.quantity, 10);
        if (!productId || !variantId || !Number.isInteger(quantity) || quantity < 0) throw new Error("SKU hoặc số lượng trên phiếu không hợp lệ.");
        if (["receipt", "quarantine", "release"].includes(type) && quantity < 1) {
          throw new Error("Số lượng của nghiệp vụ này phải là số nguyên lớn hơn 0.");
        }
        const variantResult = await transaction.request()
          .input("product_id", sql.Int, productId)
          .input("variant_id", sql.NVarChar, variantId)
          .query(`SELECT id,sku,stock_quantity,reserved_quantity,quarantine_quantity,incoming_quantity,cost_price
                  FROM ProductVariants WITH (UPDLOCK,ROWLOCK)
                  WHERE id=@variant_id AND product_id=@product_id AND is_active=1`);
        const variant = variantResult.recordset[0];
        if (!variant) throw new Error(`Không tìm thấy SKU ${variantId} đang hoạt động.`);

        const before = Number(variant.stock_quantity || 0);
        const reservedBefore = Number(variant.reserved_quantity || 0);
        const quarantineBefore = Number(variant.quarantine_quantity || 0);
        const incomingBefore = Number(variant.incoming_quantity || 0);
        const availableBefore = Math.max(0, before - reservedBefore - quarantineBefore);
        let after = before;
        let quarantineAfter = quarantineBefore;
        let incomingAfter = incomingBefore;
        let change = 0;
        let movementType = type;
        const expected = input.expectedQuantity == null ? before : Number.parseInt(input.expectedQuantity, 10);
        const unitCost = input.unitCost == null || input.unitCost === "" ? null : Number(input.unitCost);
        let costAfter = Number(variant.cost_price || 0);
        let sellableQuantity = null;
        let receivedQuarantineQuantity = null;

        if (type === "receipt") {
          if (!Number.isFinite(unitCost) || unitCost <= 0) throw new Error(`SKU ${variant.sku} cần có giá nhập hợp lệ.`);
          sellableQuantity = Number.parseInt(input.sellableQuantity ?? quantity, 10);
          receivedQuarantineQuantity = Number.parseInt(input.quarantineQuantity ?? (quantity - sellableQuantity), 10);
          if (!Number.isInteger(sellableQuantity) || !Number.isInteger(receivedQuarantineQuantity) || sellableQuantity < 0 || receivedQuarantineQuantity < 0 || sellableQuantity + receivedQuarantineQuantity !== quantity) {
            throw new Error(`SKU ${variant.sku}: số đạt chất lượng và chờ kiểm tra phải bằng tổng số nhận.`);
          }
          change = quantity;
          after = before + quantity;
          quarantineAfter += receivedQuarantineQuantity;
          incomingAfter = Math.max(0, incomingBefore - quantity);
          movementType = "receipt";
          if (data.updateCostPrice) costAfter = Math.round(((before * Number(variant.cost_price || 0)) + (quantity * unitCost)) / Math.max(1, after));
        }
        else if (type === "stocktake") {
          after = quantity;
          if (after < reservedBefore + quarantineBefore) throw new Error(`SKU ${variant.sku}: số kiểm kê không thể thấp hơn tổng hàng đang giữ và chờ kiểm tra.`);
          change = after - before;
          movementType = "stocktake_adjustment";
        }
        else if (type === "special_adjustment") {
          after = quantity;
          if (after < reservedBefore + quarantineBefore) throw new Error(`SKU ${variant.sku}: tồn mới không thể thấp hơn tổng hàng đang giữ và chờ kiểm tra.`);
          change = after - before;
          movementType = "special_adjustment";
        }
        else if (type === "quarantine") {
          const available = Math.max(0, before - reservedBefore - quarantineBefore);
          if (available === 0) throw new Error(`SKU ${variant.sku} không còn hàng có thể bán để chuyển sang chờ kiểm tra.`);
          if (quantity > available) throw new Error(`SKU ${variant.sku} không đủ hàng có thể bán để chuyển chờ kiểm tra.`);
          quarantineAfter += quantity;
          movementType = "quarantine_hold";
        } else if (type === "release") {
          if (quarantineBefore === 0) throw new Error(`SKU ${variant.sku} không có hàng chờ kiểm tra để đưa lại vào bán.`);
          if (quantity > quarantineBefore) throw new Error(`SKU ${variant.sku} chỉ có ${quarantineBefore} sản phẩm chờ kiểm tra.`);
          quarantineAfter -= quantity;
          movementType = "quarantine_release";
        }

        const availableAfter = Math.max(0, after - reservedBefore - quarantineAfter);

        await transaction.request()
          .input("variant_id", sql.NVarChar, variantId)
          .input("stock", sql.Int, after)
          .input("quarantine", sql.Int, quarantineAfter)
          .input("incoming", sql.Int, incomingAfter)
          .input("cost", sql.Decimal(18,0), costAfter)
          .query("UPDATE ProductVariants SET stock_quantity=@stock,quarantine_quantity=@quarantine,incoming_quantity=@incoming,cost_price=@cost,updated_at=GETDATE() WHERE id=@variant_id");
        const totalResult = await transaction.request().input("product_id", sql.Int, productId)
          .query("SELECT COALESCE(SUM(stock_quantity),0) total FROM ProductVariants WHERE product_id=@product_id AND is_active=1");
        const productStockAfter = Number(totalResult.recordset[0].total);
        await transaction.request().input("product_id", sql.Int, productId).input("stock", sql.Int, productStockAfter)
          .query("UPDATE Products SET stock=@stock,updated_at=GETDATE() WHERE id=@product_id");

        await transaction.request()
          .input("document_id", sql.BigInt, document.id).input("product_id", sql.Int, productId).input("variant_id", sql.NVarChar, variantId)
          .input("expected", sql.Int, Number.isInteger(expected) ? expected : null).input("actual", sql.Int, quantity).input("change", sql.Int, change)
          .input("cost", sql.Decimal(18,0), unitCost).input("disposition", sql.NVarChar, input.disposition || null)
          .input("sellable", sql.Int, sellableQuantity).input("quarantine_received", sql.Int, receivedQuarantineQuantity)
          .input("cost_before", sql.Decimal(18,0), Number(variant.cost_price || 0)).input("cost_after", sql.Decimal(18,0), costAfter)
          .query(`INSERT INTO InventoryDocumentItems(document_id,product_id,variant_id,expected_quantity,actual_quantity,quantity_change,unit_cost,disposition,
                    sellable_quantity,quarantine_quantity,unit_cost_before,unit_cost_after)
                  VALUES(@document_id,@product_id,@variant_id,@expected,@actual,@change,@cost,@disposition,@sellable,@quarantine_received,@cost_before,@cost_after)`);
        await transaction.request()
          .input("product_id", sql.Int, productId).input("variant_id", sql.NVarChar, variantId).input("movement_type", sql.NVarChar, movementType)
          .input("change", sql.Int, change).input("resulting", sql.Int, after).input("reference", sql.NVarChar, documentCode)
          .input("note", sql.NVarChar, String(data.note).trim()).input("actor", sql.NVarChar, actor)
          .input("before", sql.Int, before).input("after", sql.Int, after).input("product_after", sql.Int, productStockAfter)
          .input("reason", sql.NVarChar, data.reasonCode || type).input("reference_type", sql.NVarChar, "inventory_document")
          .input("available_before", sql.Int, availableBefore).input("available_after", sql.Int, availableAfter)
          .input("reserved_before", sql.Int, reservedBefore).input("reserved_after", sql.Int, reservedBefore)
          .input("quarantine_before", sql.Int, quarantineBefore).input("quarantine_after", sql.Int, quarantineAfter)
          .query(`INSERT INTO InventoryMovements(product_id,variant_id,movement_type,quantity_change,resulting_stock,reference_id,note,performed_by,created_at,
                    reason_code,quantity_before,quantity_after,product_stock_after,reference_type,approved_by,
                    available_before,available_after,reserved_before,reserved_after,quarantine_before,quarantine_after)
                  VALUES(@product_id,@variant_id,@movement_type,@change,@resulting,@reference,@note,@actor,GETDATE(),
                    @reason,@before,@after,@product_after,@reference_type,@actor,
                    @available_before,@available_after,@reserved_before,@reserved_after,@quarantine_before,@quarantine_after)`);
      }
      await transaction.commit();
      return { id: document.id, documentCode: document.document_code };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async reverseInventoryDocument(documentId, reason, actor = "Admin") {
    const p = await getActivePool();
    const cleanReason = String(reason || "").trim();
    if (cleanReason.length < 10) throw new Error("Lý do đảo phiếu phải có ít nhất 10 ký tự.");
    const transaction = new sql.Transaction(p);
    await transaction.begin();
    try {
      const documentResult = await transaction.request().input("id", sql.BigInt, Number(documentId)).query(`
        SELECT * FROM InventoryDocuments WITH (UPDLOCK,ROWLOCK) WHERE id=@id
      `);
      const original = documentResult.recordset[0];
      if (!original) throw new Error("Không tìm thấy phiếu kho cần đảo.");
      if (original.status !== "completed" || original.document_type === "reversal") throw new Error("Chỉ có thể đảo phiếu kho đã hoàn tất và chưa bị đảo.");
      const itemsResult = await transaction.request().input("document_id", sql.BigInt, original.id).query(`
        SELECT * FROM InventoryDocumentItems WHERE document_id=@document_id ORDER BY id
      `);
      if (!itemsResult.recordset.length) throw new Error("Phiếu kho không có dòng SKU để đảo.");

      for (const item of itemsResult.recordset) {
        const later = await transaction.request()
          .input("variant_id", sql.NVarChar, item.variant_id)
          .input("completed_at", sql.DateTime2, original.completed_at || original.created_at)
          .input("reference", sql.NVarChar, original.document_code)
          .query(`SELECT TOP 1 id FROM InventoryMovements
                  WHERE variant_id=@variant_id AND created_at>@completed_at AND ISNULL(reference_id,'')<>@reference`);
        if (later.recordset.length) throw new Error(`SKU ${item.variant_id} đã có biến động sau phiếu này. Hãy đảo các phiếu mới hơn trước.`);
      }

      const reversalCode = `REV-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${Date.now().toString().slice(-7)}`;
      const reversalResult = await transaction.request()
        .input("code", sql.NVarChar, reversalCode).input("original_code", sql.NVarChar, original.document_code)
        .input("original_id", sql.BigInt, original.id).input("note", sql.NVarChar, cleanReason).input("actor", sql.NVarChar, actor)
        .query(`INSERT INTO InventoryDocuments(document_code,document_type,status,reference_id,note,created_by,approved_by,completed_at,reversed_document_id)
                OUTPUT inserted.id,inserted.document_code
                VALUES(@code,'reversal','completed',@original_code,@note,@actor,@actor,GETDATE(),@original_id)`);
      const reversal = reversalResult.recordset[0];

      for (const item of itemsResult.recordset) {
        const variantResult = await transaction.request().input("variant_id", sql.NVarChar, item.variant_id).query(`
          SELECT id,sku,stock_quantity,reserved_quantity,quarantine_quantity,incoming_quantity,cost_price
          FROM ProductVariants WITH (UPDLOCK,ROWLOCK) WHERE id=@variant_id
        `);
        const variant = variantResult.recordset[0];
        if (!variant) throw new Error(`Không tìm thấy SKU ${item.variant_id}.`);
        const before = Number(variant.stock_quantity || 0);
        const reserved = Number(variant.reserved_quantity || 0);
        const quarantineBefore = Number(variant.quarantine_quantity || 0);
        let after = before;
        let quarantineAfter = quarantineBefore;
        let incomingAfter = Number(variant.incoming_quantity || 0);
        if (original.document_type === "receipt") {
          after -= Number(item.actual_quantity || 0);
          quarantineAfter -= Number(item.quarantine_quantity || 0);
          incomingAfter += Number(item.actual_quantity || 0);
        } else if (["stocktake", "special_adjustment"].includes(original.document_type)) {
          after = Number(item.expected_quantity || 0);
        } else if (original.document_type === "quarantine") {
          quarantineAfter -= Number(item.actual_quantity || 0);
        } else if (original.document_type === "release") {
          quarantineAfter += Number(item.actual_quantity || 0);
        }
        if (after < 0 || quarantineAfter < 0 || after < reserved + quarantineAfter) {
          throw new Error(`Không thể đảo phiếu vì tồn hiện tại của SKU ${variant.sku} không còn đáp ứng điều kiện an toàn.`);
        }
        const availableBefore = Math.max(0, before - reserved - quarantineBefore);
        const availableAfter = Math.max(0, after - reserved - quarantineAfter);
        const change = after - before;
        const costAfter = item.unit_cost_before == null ? Number(variant.cost_price || 0) : Number(item.unit_cost_before);
        await transaction.request().input("variant_id", sql.NVarChar, item.variant_id)
          .input("stock", sql.Int, after).input("quarantine", sql.Int, quarantineAfter).input("incoming", sql.Int, incomingAfter)
          .input("cost", sql.Decimal(18,0), costAfter)
          .query(`UPDATE ProductVariants SET stock_quantity=@stock,quarantine_quantity=@quarantine,incoming_quantity=@incoming,cost_price=@cost,updated_at=GETDATE() WHERE id=@variant_id`);
        const totalResult = await transaction.request().input("product_id", sql.Int, item.product_id)
          .query("SELECT COALESCE(SUM(stock_quantity),0) total FROM ProductVariants WHERE product_id=@product_id AND is_active=1");
        const productStockAfter = Number(totalResult.recordset[0].total);
        await transaction.request().input("product_id", sql.Int, item.product_id).input("stock", sql.Int, productStockAfter)
          .query("UPDATE Products SET stock=@stock,updated_at=GETDATE() WHERE id=@product_id");
        await transaction.request().input("document_id", sql.BigInt, reversal.id).input("product_id", sql.Int, item.product_id)
          .input("variant_id", sql.NVarChar, item.variant_id).input("expected", sql.Int, before).input("actual", sql.Int, after)
          .input("change", sql.Int, change).input("cost_before", sql.Decimal(18,0), Number(variant.cost_price || 0)).input("cost_after", sql.Decimal(18,0), costAfter)
          .query(`INSERT INTO InventoryDocumentItems(document_id,product_id,variant_id,expected_quantity,actual_quantity,quantity_change,unit_cost_before,unit_cost_after)
                  VALUES(@document_id,@product_id,@variant_id,@expected,@actual,@change,@cost_before,@cost_after)`);
        await transaction.request().input("product_id", sql.Int, item.product_id).input("variant_id", sql.NVarChar, item.variant_id)
          .input("change", sql.Int, change).input("after", sql.Int, after).input("reference", sql.NVarChar, reversalCode)
          .input("note", sql.NVarChar, cleanReason).input("actor", sql.NVarChar, actor).input("before", sql.Int, before)
          .input("product_after", sql.Int, productStockAfter).input("available_before", sql.Int, availableBefore).input("available_after", sql.Int, availableAfter)
          .input("reserved", sql.Int, reserved).input("quarantine_before", sql.Int, quarantineBefore).input("quarantine_after", sql.Int, quarantineAfter)
          .query(`INSERT INTO InventoryMovements(product_id,variant_id,movement_type,quantity_change,resulting_stock,reference_id,note,performed_by,created_at,
                    reason_code,quantity_before,quantity_after,product_stock_after,reference_type,approved_by,available_before,available_after,reserved_before,reserved_after,quarantine_before,quarantine_after)
                  VALUES(@product_id,@variant_id,'document_reversal',@change,@after,@reference,@note,@actor,GETDATE(),'document_reversal',@before,@after,@product_after,'inventory_document',@actor,@available_before,@available_after,@reserved,@reserved,@quarantine_before,@quarantine_after)`);
      }
      await transaction.request().input("id", sql.BigInt, original.id).input("reason", sql.NVarChar, cleanReason)
        .query("UPDATE InventoryDocuments SET status='reversed',reversed_at=GETDATE(),reversal_reason=@reason WHERE id=@id");
      await transaction.commit();
      return { id: reversal.id, documentCode: reversal.document_code };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  // Revenue uses four independent dates: order creation, payment verification,
  // recognition (delivered + paid), and refund. This prevents one mutable status
  // from silently rewriting historical business performance.
  async getRevenueReport({ from = null, to = null, previousFrom = null, previousTo = null } = {}) {
    const allOrders = await this.getAllOrders();
    const pool = await getActivePool();
    const inventoryRows = (await pool.request().query(`
      SELECT sku,stock_quantity,low_stock_threshold,max_stock_threshold,cost_price,price
      FROM ProductVariants WHERE is_active=1
    `)).recordset;
    const inventoryBySku = new Map(inventoryRows.map((row) => [String(row.sku || "").toLowerCase(), row]));
    const amount = (value) => Number(value || 0);
    const inRange = (value, start, end) => {
      if (!value) return false;
      const time = new Date(value).getTime();
      return (!start || time >= start.getTime()) && (!end || time < end.getTime());
    };
    const recognizedDate = (order) => order.recognized_at || null;

    const summarize = (start, end, includeDetails = false) => {
      const createdOrders = allOrders.filter((order) => inRange(order.created_at, start, end));
      const recognizedOrders = allOrders.filter((order) => inRange(recognizedDate(order), start, end));
      const collectedOrders = allOrders.filter((order) => inRange(order.payment?.verified_at, start, end));
      const refundedOrders = allOrders.filter((order) => inRange(order.payment?.refunded_at, start, end));

      const grossMerchandiseValue = createdOrders
        .filter((order) => order.order_status !== "cancelled")
        .reduce((sum, order) => sum + amount(order.original_subtotal || order.total_amount), 0);
      const recognizedRevenue = recognizedOrders.reduce((sum, order) => sum + amount(order.total_amount), 0);
      const actualCollectedRevenue = collectedOrders.reduce((sum, order) => sum + amount(order.payment?.amount || order.total_amount), 0);
      const refundedRevenue = refundedOrders.reduce((sum, order) => sum + amount(order.payment?.amount || order.total_amount), 0);
      const netRevenue = recognizedRevenue - refundedRevenue;
      const productDiscountTotal = recognizedOrders.reduce((sum, order) => sum + amount(order.product_discount_total), 0);
      const codeDiscountTotal = recognizedOrders.reduce((sum, order) => sum + amount(order.code_discount_total), 0);
      const shippingDiscountTotal = recognizedOrders.reduce((sum, order) => sum + amount(order.shipping_discount_total), 0);
      const shippingRevenue = recognizedOrders.reduce((sum, order) => sum + amount(order.shipping_fee), 0);
      const totalDiscount = productDiscountTotal + codeDiscountTotal + shippingDiscountTotal;
      const allRecognizedItems = recognizedOrders.flatMap((order) => order.items || []);
      const itemsWithCost = allRecognizedItems.filter((item) => item.unit_cost_snapshot != null);
      const costOfGoodsSold = itemsWithCost.reduce((sum, item) => sum + amount(item.unit_cost_snapshot) * amount(item.quantity), 0);
      const merchandiseRevenue = recognizedOrders.reduce((sum, order) => sum + amount(order.total_amount) - amount(order.shipping_fee), 0);
      const grossProfit = itemsWithCost.length === allRecognizedItems.length && allRecognizedItems.length > 0
        ? merchandiseRevenue - costOfGoodsSold
        : null;
      const unitsSold = allRecognizedItems.reduce((sum, item) => sum + amount(item.quantity), 0);
      const deliveredOrders = createdOrders.filter((order) => order.order_status === "delivered");
      const cancelledOrders = createdOrders.filter((order) => order.order_status === "cancelled");
      const cancelledRevenue = cancelledOrders.reduce((sum, order) => sum + amount(order.total_amount), 0);

      const summary = {
        grossMerchandiseValue,
        recognizedRevenue,
        actualCollectedRevenue,
        refundedRevenue,
        netRevenue,
        productDiscountTotal,
        codeDiscountTotal,
        shippingDiscountTotal,
        shippingRevenue,
        totalDiscount,
        discountRate: recognizedRevenue > 0 ? totalDiscount / (recognizedRevenue + totalDiscount) * 100 : 0,
        costOfGoodsSold,
        grossProfit,
        grossMargin: grossProfit == null || merchandiseRevenue <= 0 ? null : grossProfit / merchandiseRevenue * 100,
        costCoverage: allRecognizedItems.length ? itemsWithCost.length / allRecognizedItems.length * 100 : 0,
        totalOrders: createdOrders.length,
        deliveredOrdersCount: deliveredOrders.length,
        cancelledOrdersCount: cancelledOrders.length,
        cancellationRate: createdOrders.length ? cancelledOrders.length / createdOrders.length * 100 : 0,
        deliverySuccessRate: createdOrders.length ? deliveredOrders.length / createdOrders.length * 100 : 0,
        cancelledRevenue,
        unitsSold,
        averageItemsPerOrder: recognizedOrders.length ? unitsSold / recognizedOrders.length : 0,
        recognizedOrdersCount: recognizedOrders.length,
        paidOrdersCount: collectedOrders.length,
        refundedOrdersCount: refundedOrders.length,
        averageOrderValue: recognizedOrders.length ? Math.round(recognizedRevenue / recognizedOrders.length) : 0,
        refundRate: recognizedRevenue > 0 ? refundedRevenue / recognizedRevenue * 100 : 0,
      };
      if (!includeDetails) return summary;

      const currentOrders = createdOrders;
      summary.pendingVerificationRevenue = currentOrders.filter((order) => order.payment?.payment_status === "pending_verification").reduce((sum, order) => sum + amount(order.total_amount), 0);
      summary.refundPendingRevenue = allOrders.filter((order) => order.payment?.payment_status === "refund_pending").reduce((sum, order) => sum + amount(order.total_amount), 0);
      summary.unpaidRevenue = currentOrders.filter((order) => ["unpaid", null, undefined].includes(order.payment?.payment_status)).reduce((sum, order) => sum + amount(order.total_amount), 0);
      summary.ordersByStatus = Object.fromEntries(["pending", "confirmed", "processing", "shipping", "delivered", "cancelled"].map((status) => [status, currentOrders.filter((order) => order.order_status === status).length]));
      const paymentMethods = new Map();
      for (const order of collectedOrders) {
        const method = order.payment?.payment_method || "unknown";
        const entry = paymentMethods.get(method) || { method, orders: 0, amount: 0 };
        entry.orders += 1;
        entry.amount += amount(order.payment?.amount || order.total_amount);
        paymentMethods.set(method, entry);
      }
      summary.paymentMethods = [...paymentMethods.values()].sort((a, b) => b.amount - a.amount);
      const outstandingOrders = currentOrders.filter((order) => ["unpaid", "pending_verification", null, undefined].includes(order.payment?.payment_status) && order.order_status !== "cancelled");
      const nowTime = Date.now();
      summary.paymentAging = {
        totalOrders: outstandingOrders.length,
        totalAmount: outstandingOrders.reduce((sum, order) => sum + amount(order.total_amount), 0),
        over24Hours: outstandingOrders.filter((order) => (nowTime - new Date(order.created_at).getTime()) > 86400000).length,
        oldestHours: outstandingOrders.length ? Math.max(...outstandingOrders.map((order) => (nowTime - new Date(order.created_at).getTime()) / 3600000)) : 0,
      };

      const categorySales = { men: 0, women: 0, kids: 0, unknown: 0 };
      const productSalesMap = new Map();
      const promotionMap = new Map();
      const trendMap = new Map();
      for (const order of recognizedOrders) {
        const day = new Date(recognizedDate(order)).toISOString().slice(0, 10);
        const trend = trendMap.get(day) || { date: day, revenue: 0, orders: 0, units: 0, refunds: 0, cost: 0, grossProfit: 0, discounts: 0 };
        trend.revenue += amount(order.total_amount);
        trend.orders += 1;
        trend.units += (order.items || []).reduce((sum, item) => sum + amount(item.quantity), 0);
        trend.discounts += amount(order.product_discount_total) + amount(order.code_discount_total) + amount(order.shipping_discount_total);
        const orderCost = (order.items || []).reduce((sum, item) => sum + amount(item.unit_cost_snapshot) * amount(item.quantity), 0);
        trend.cost += orderCost;
        trend.grossProfit += amount(order.total_amount) - amount(order.shipping_fee) - orderCost;
        trendMap.set(day, trend);

        for (const item of order.items || []) {
          const catalogProduct = catalogProducts.find((product) => product.id === Number(item.product_id));
          const category = ["men", "women", "kids"].includes(catalogProduct?.audience) ? catalogProduct.audience : "unknown";
          const lineRevenue = amount(item.final_line_total ?? item.total_price);
          categorySales[category] += lineRevenue;
          const key = item.variant_sku || `product-${item.product_id}`;
          const inventory = inventoryBySku.get(String(item.variant_sku || "").toLowerCase());
          const product = productSalesMap.get(key) || { id: item.product_id, sku: item.variant_sku || "Chưa có SKU", name: item.product_name, total_quantity: 0, total_revenue: 0, total_cost: 0, cost_complete: true, image_url: item.image_url, stock_quantity: amount(inventory?.stock_quantity), low_stock_threshold: amount(inventory?.low_stock_threshold), max_stock_threshold: amount(inventory?.max_stock_threshold) };
          product.total_quantity += amount(item.quantity);
          product.total_revenue += lineRevenue;
          if (item.unit_cost_snapshot == null) product.cost_complete = false;
          else product.total_cost += amount(item.unit_cost_snapshot) * amount(item.quantity);
          productSalesMap.set(key, product);
        }

        const discount = amount(order.product_discount_total) + amount(order.code_discount_total) + amount(order.shipping_discount_total);
        if (discount > 0) {
          let names = [];
          try {
            const snapshot = JSON.parse(order.promotion_snapshot_json || "{}");
            names = [...(snapshot.automaticPromotions || []).map((promotion) => promotion.name), snapshot.codePromotion?.name].filter(Boolean);
          } catch { /* Invalid legacy snapshot: use the fallback label below. */ }
          if (!names.length) names = [order.promotion_code || "Khuyến mãi tự động"];
          for (const name of new Set(names)) {
            const promotion = promotionMap.get(name) || { name, orders: 0, attributedRevenue: 0, discountCost: 0 };
            promotion.orders += 1;
            promotion.attributedRevenue += amount(order.total_amount) / names.length;
            promotion.discountCost += discount / names.length;
            promotionMap.set(name, promotion);
          }
        }
      }
      for (const order of refundedOrders) {
        const day = new Date(order.payment.refunded_at).toISOString().slice(0, 10);
        const trend = trendMap.get(day) || { date: day, revenue: 0, orders: 0, units: 0, refunds: 0, cost: 0, grossProfit: 0, discounts: 0 };
        trend.refunds += amount(order.payment?.amount || order.total_amount);
        trendMap.set(day, trend);
      }

      summary.categorySales = categorySales;
      const reportDays = from && to ? Math.max(1, Math.ceil((to - from) / 86400000)) : Math.max(1, ...recognizedOrders.map((order) => Math.ceil((Date.now() - new Date(recognizedDate(order)).getTime()) / 86400000)));
      summary.topSellingProducts = [...productSalesMap.values()].map((product) => {
        const dailySales = product.total_quantity / reportDays;
        return { ...product, gross_profit: product.cost_complete ? product.total_revenue - product.total_cost : null, sell_through_rate: product.total_quantity + product.stock_quantity > 0 ? product.total_quantity / (product.total_quantity + product.stock_quantity) * 100 : 0, days_of_cover: dailySales > 0 ? product.stock_quantity / dailySales : null };
      }).sort((a, b) => b.total_revenue - a.total_revenue);
      summary.promotionPerformance = [...promotionMap.values()].sort((a, b) => b.attributedRevenue - a.attributedRevenue);
      summary.trend = [...trendMap.values()].sort((a, b) => a.date.localeCompare(b.date));
      summary.auditOrders = recognizedOrders.map((order) => ({
        id: order.id, customer_name: order.customer_name, customer_email: order.customer_email,
        created_at: order.created_at, delivered_at: order.delivered_at, recognized_at: order.recognized_at,
        verified_at: order.payment?.verified_at, payment_method: order.payment?.payment_method,
        transaction_reference: order.payment?.transaction_reference, original_subtotal: amount(order.original_subtotal),
        discounts: amount(order.product_discount_total) + amount(order.code_discount_total) + amount(order.shipping_discount_total),
        shipping_fee: amount(order.shipping_fee), total_amount: amount(order.total_amount), items: order.items,
      })).sort((a, b) => new Date(b.recognized_at) - new Date(a.recognized_at));
      summary.dataOriginBreakdown = recognizedOrders.reduce((result, order) => {
        const origin = order.data_origin === "simulated" ? "simulated" : "actual";
        result[origin].orders += 1;
        result[origin].revenue += amount(order.total_amount);
        return result;
      }, { actual: { orders: 0, revenue: 0 }, simulated: { orders: 0, revenue: 0 } });
      const firstRecognizedByCustomer = new Map();
      for (const order of allOrders.filter((entry) => entry.recognized_at).sort((a, b) => new Date(a.recognized_at) - new Date(b.recognized_at))) {
        const customerKey = String(order.customer_id || order.customer_email || "").toLowerCase();
        if (customerKey && !firstRecognizedByCustomer.has(customerKey)) firstRecognizedByCustomer.set(customerKey, order.id);
      }
      const customerMap = new Map();
      const customerSummary = { new: { customers: new Set(), orders: 0, revenue: 0 }, returning: { customers: new Set(), orders: 0, revenue: 0 } };
      for (const order of recognizedOrders) {
        const customerKey = String(order.customer_id || order.customer_email || "guest").toLowerCase();
        const segment = firstRecognizedByCustomer.get(customerKey) === order.id ? "new" : "returning";
        customerSummary[segment].customers.add(customerKey); customerSummary[segment].orders += 1; customerSummary[segment].revenue += amount(order.total_amount);
        const customer = customerMap.get(customerKey) || { id: order.customer_id, name: order.customer_name, email: order.customer_email, orders: 0, revenue: 0 };
        customer.orders += 1; customer.revenue += amount(order.total_amount); customerMap.set(customerKey, customer);
      }
      summary.customerSegments = {
        new: { customers: customerSummary.new.customers.size, orders: customerSummary.new.orders, revenue: customerSummary.new.revenue, averageOrderValue: customerSummary.new.orders ? customerSummary.new.revenue / customerSummary.new.orders : 0 },
        returning: { customers: customerSummary.returning.customers.size, orders: customerSummary.returning.orders, revenue: customerSummary.returning.revenue, averageOrderValue: customerSummary.returning.orders ? customerSummary.returning.revenue / customerSummary.returning.orders : 0 },
        repeatCustomerRate: customerMap.size ? [...customerMap.values()].filter((customer) => customer.orders > 1).length / customerMap.size * 100 : 0,
      };
      summary.topCustomers = [...customerMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
      return summary;
    };

    const report = summarize(from, to, true);
    const previous = previousFrom && previousTo ? summarize(previousFrom, previousTo, false) : null;
    const change = (current, old) => old ? (current - old) / old * 100 : null;
    report.comparison = previous ? {
      recognizedRevenue: change(report.recognizedRevenue, previous.recognizedRevenue),
      netRevenue: change(report.netRevenue, previous.netRevenue),
      orderCount: change(report.recognizedOrdersCount, previous.recognizedOrdersCount),
      averageOrderValue: change(report.averageOrderValue, previous.averageOrderValue),
      totalOrders: change(report.totalOrders, previous.totalOrders),
      unitsSold: change(report.unitsSold, previous.unitsSold),
      grossProfit: report.grossProfit == null || previous.grossProfit == null ? null : change(report.grossProfit, previous.grossProfit),
      cancellationRate: report.cancellationRate - previous.cancellationRate,
      refundRate: report.refundRate - previous.refundRate,
      previous,
    } : null;
    report.period = { from: from?.toISOString() || null, to: to?.toISOString() || null };
    return report;
  },

  // --- Email Notifications Ledger & Idempotency ---
  async getEmailNotificationByEventKey(eventKey) {
    const p = await getActivePool();
    const result = await p
      .request()
      .input("event_key", sql.NVarChar(180), String(eventKey || ""))
      .query("SELECT TOP 1 * FROM EmailNotifications WHERE event_key = @event_key");
    return result.recordset[0] || null;
  },

  async getEmailNotificationById(id) {
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) return null;
    const p = await getActivePool();
    const result = await p
      .request()
      .input("id", sql.Int, numId)
      .query("SELECT TOP 1 * FROM EmailNotifications WHERE id = @id");
    return result.recordset[0] || null;
  },

  async getEmailNotifications({ status, eventType, limit = 50 } = {}) {
    const p = await getActivePool();
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
    const req = p.request().input("limit", sql.Int, safeLimit);
    const clauses = [];
    if (status) {
      clauses.push("status = @status");
      req.input("status", sql.NVarChar(20), String(status));
    }
    if (eventType) {
      clauses.push("event_type = @event_type");
      req.input("event_type", sql.NVarChar(64), String(eventType));
    }
    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await req.query(`
      SELECT TOP (@limit) id, event_key, event_type, entity_type, entity_id, recipient_email, subject,
             provider, status, provider_message_id, error_message, meta_json, attempts,
             last_attempt_at, sent_at, created_at, updated_at
      FROM EmailNotifications
      ${whereSql}
      ORDER BY created_at DESC, id DESC
    `);
    return result.recordset;
  },

  async reserveEmailNotification({
    eventKey,
    eventType,
    entityType,
    entityId,
    recipientEmail,
    subject,
    provider = "resend",
    metaJson = null,
    allowRetry = false,
  }) {
    const p = await getActivePool();
    const safeMeta = metaJson ? String(metaJson).slice(0, 2000) : null;
    const safeRecipients = String(recipientEmail || "").slice(0, 500);
    const safeSubject = String(subject || "").slice(0, 255);
    const safeEventKey = String(eventKey || "").slice(0, 180);

    try {
      const insertRes = await p
        .request()
        .input("event_key", sql.NVarChar(180), safeEventKey)
        .input("event_type", sql.NVarChar(64), String(eventType))
        .input("entity_type", sql.NVarChar(64), String(entityType))
        .input("entity_id", sql.NVarChar(128), String(entityId))
        .input("recipient_email", sql.NVarChar(500), safeRecipients)
        .input("subject", sql.NVarChar(255), safeSubject)
        .input("provider", sql.NVarChar(32), String(provider))
        .input("meta_json", sql.NVarChar(2000), safeMeta)
        .query(`
          INSERT INTO EmailNotifications (
            event_key, event_type, entity_type, entity_id, recipient_email, subject, provider,
            status, meta_json, attempts, last_attempt_at, created_at, updated_at
          )
          OUTPUT INSERTED.*
          VALUES (
            @event_key, @event_type, @entity_type, @entity_id, @recipient_email, @subject, @provider,
            'pending', @meta_json, 1, SYSUTCDATETIME(), SYSUTCDATETIME(), SYSUTCDATETIME()
          )
        `);
      return { reserved: true, notification: insertRes.recordset[0] };
    } catch (err) {
      const errNum = err?.number || err?.originalError?.info?.number;
      if (errNum !== 2627 && errNum !== 2601) throw err;

      const existing = await this.getEmailNotificationByEventKey(safeEventKey);
      if (!existing) {
        return { reserved: false, reason: "conflict", notification: null };
      }
      if (existing.status === "sent") {
        return { reserved: false, reason: "already_sent", notification: existing };
      }
      if (existing.status === "pending") {
        return { reserved: false, reason: "in_progress", notification: existing };
      }
      if (!allowRetry) {
        return { reserved: false, reason: `already_${existing.status}`, notification: existing };
      }

      const updateRes = await p
        .request()
        .input("id", sql.Int, existing.id)
        .input("recipient_email", sql.NVarChar(500), safeRecipients)
        .input("subject", sql.NVarChar(255), safeSubject)
        .input("meta_json", sql.NVarChar(2000), safeMeta || existing.meta_json)
        .query(`
          UPDATE EmailNotifications
          SET status = 'pending',
              attempts = attempts + 1,
              recipient_email = @recipient_email,
              subject = @subject,
              meta_json = @meta_json,
              error_message = NULL,
              last_attempt_at = SYSUTCDATETIME(),
              updated_at = SYSUTCDATETIME()
          OUTPUT INSERTED.*
          WHERE id = @id AND status IN ('failed', 'skipped')
        `);
      if (updateRes.recordset.length === 0) {
        const latest = await this.getEmailNotificationById(existing.id);
        return { reserved: false, reason: "retry_race", notification: latest };
      }
      return { reserved: true, notification: updateRes.recordset[0] };
    }
  },

  async markEmailNotificationResult(id, { status, providerMessageId = null, errorMessage = null }) {
    const p = await getActivePool();
    const safeError = errorMessage ? String(errorMessage).slice(0, 1000) : null;
    const safeMsgId = providerMessageId ? String(providerMessageId).slice(0, 128) : null;
    const result = await p
      .request()
      .input("id", sql.Int, Number(id))
      .input("status", sql.NVarChar(20), String(status))
      .input("provider_message_id", sql.NVarChar(128), safeMsgId)
      .input("error_message", sql.NVarChar(1000), safeError)
      .query(`
        UPDATE EmailNotifications
        SET status = @status,
            provider_message_id = COALESCE(@provider_message_id, provider_message_id),
            error_message = @error_message,
            sent_at = CASE WHEN @status = 'sent' THEN COALESCE(sent_at, SYSUTCDATETIME()) ELSE sent_at END,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE id = @id
      `);
    return result.recordset[0] || null;
  },

  async getRevenueTarget(periodKey) {
    const p = await getActivePool();
    const result = await p.request().input("period_key", sql.NVarChar, periodKey).query("SELECT * FROM RevenueTargets WHERE period_key=@period_key");
    return result.recordset[0] || null;
  },

  async upsertRevenueTarget({ periodKey, periodLabel, targetRevenue, targetGrossProfit, note, updatedBy }) {
    const p = await getActivePool();
    await p.request().input("period_key", sql.NVarChar, periodKey).input("period_label", sql.NVarChar, periodLabel || null)
      .input("target_revenue", sql.Decimal(18, 0), targetRevenue).input("target_gross_profit", sql.Decimal(18, 0), targetGrossProfit || null)
      .input("note", sql.NVarChar, note || null).input("updated_by", sql.NVarChar, updatedBy || null).query(`
        MERGE RevenueTargets AS target USING (SELECT @period_key AS period_key) AS source ON target.period_key=source.period_key
        WHEN MATCHED THEN UPDATE SET period_label=@period_label,target_revenue=@target_revenue,target_gross_profit=@target_gross_profit,note=@note,updated_by=@updated_by,updated_at=GETDATE()
        WHEN NOT MATCHED THEN INSERT(period_key,period_label,target_revenue,target_gross_profit,note,updated_by) VALUES(@period_key,@period_label,@target_revenue,@target_gross_profit,@note,@updated_by);
      `);
    return this.getRevenueTarget(periodKey);
  },

  async createPasswordResetOtp({ userId, email, otpHash, expiresInMinutes = 15, maxAttempts = 5 }) {
    const p = await getActivePool();
    const safeEmail = String(email || "").trim().toLowerCase();
    await p
      .request()
      .input("user_id", sql.NVarChar(50), String(userId))
      .query("UPDATE PasswordResetOtps SET used_at = SYSUTCDATETIME() WHERE user_id = @user_id AND used_at IS NULL");

    const res = await p
      .request()
      .input("user_id", sql.NVarChar(50), String(userId))
      .input("email", sql.NVarChar(150), safeEmail)
      .input("otp_hash", sql.NVarChar(128), String(otpHash))
      .input("max_attempts", sql.Int, Number(maxAttempts))
      .input("expires_minutes", sql.Int, Number(expiresInMinutes))
      .query(`
        INSERT INTO PasswordResetOtps (user_id, email, otp_hash, max_attempts, expires_at, created_at)
        OUTPUT INSERTED.*
        VALUES (@user_id, @email, @otp_hash, @max_attempts, DATEADD(MINUTE, @expires_minutes, SYSUTCDATETIME()), SYSUTCDATETIME())
      `);
    return res.recordset[0] || null;
  },

  async getLatestActivePasswordResetOtp(email) {
    const p = await getActivePool();
    const safeEmail = String(email || "").trim().toLowerCase();
    const res = await p
      .request()
      .input("email", sql.NVarChar(150), safeEmail)
      .query(`
        SELECT TOP 1 *
        FROM PasswordResetOtps
        WHERE LOWER(email) = @email
          AND used_at IS NULL
          AND expires_at > SYSUTCDATETIME()
        ORDER BY created_at DESC, id DESC
      `);
    return res.recordset[0] || null;
  },

  async incrementPasswordResetOtpAttempts(id) {
    const p = await getActivePool();
    const res = await p
      .request()
      .input("id", sql.Int, Number(id))
      .query(`
        UPDATE PasswordResetOtps
        SET attempts = attempts + 1,
            used_at = CASE WHEN attempts + 1 >= max_attempts THEN SYSUTCDATETIME() ELSE used_at END
        OUTPUT INSERTED.*
        WHERE id = @id
      `);
    return res.recordset[0] || null;
  },

  async completePasswordResetWithOtp({ otpId, userId, passwordHash }) {
    const p = await getActivePool();
    const transaction = new sql.Transaction(p);
    await transaction.begin();
    try {
      const otpUpdate = await transaction
        .request()
        .input("otp_id", sql.Int, Number(otpId))
        .query(`
          UPDATE PasswordResetOtps
          SET used_at = SYSUTCDATETIME()
          OUTPUT INSERTED.id
          WHERE id = @otp_id AND used_at IS NULL AND expires_at > SYSUTCDATETIME()
        `);
      if (otpUpdate.recordset.length === 0) {
        await transaction.rollback();
        return { completed: false, reason: "otp_already_used_or_expired" };
      }

      const userUpdate = await transaction
        .request()
        .input("user_id", sql.NVarChar(50), String(userId))
        .input("password_hash", sql.NVarChar(255), String(passwordHash))
        .query(`
          UPDATE Users
          SET password_hash = @password_hash,
              token_version = ISNULL(token_version, 1) + 1,
              updated_at = GETDATE()
          OUTPUT INSERTED.id, INSERTED.email, INSERTED.token_version
          WHERE id = @user_id AND is_active = 1
        `);

      if (userUpdate.recordset.length === 0) {
        await transaction.rollback();
        return { completed: false, reason: "user_not_found_or_inactive" };
      }

      await transaction.commit();
      return { completed: true, user: userUpdate.recordset[0] };
    } catch (err) {
      try { await transaction.rollback(); } catch { /* ignore */ }
      throw err;
    }
  },

  async subscribeNewsletter(email, source = "footer") {
    const p = await getActivePool();
    const safeEmail = String(email || "").trim().toLowerCase();
    const existing = await p
      .request()
      .input("email", sql.NVarChar(150), safeEmail)
      .query("SELECT TOP 1 * FROM NewsletterSubscribers WHERE LOWER(email) = @email");

    if (existing.recordset[0]) {
      const row = existing.recordset[0];
      const alreadyActive = Boolean(row.is_active);
      const updated = await p
        .request()
        .input("id", sql.Int, row.id)
        .input("source", sql.NVarChar(64), String(source || "footer").slice(0, 64))
        .query(`
          UPDATE NewsletterSubscribers
          SET is_active = 1,
              source = @source,
              updated_at = SYSUTCDATETIME()
          OUTPUT INSERTED.*
          WHERE id = @id
        `);
      return { subscriber: updated.recordset[0], created: !alreadyActive };
    }

    const inserted = await p
      .request()
      .input("email", sql.NVarChar(150), safeEmail)
      .input("source", sql.NVarChar(64), String(source || "footer").slice(0, 64))
      .query(`
        INSERT INTO NewsletterSubscribers (email, is_active, source, subscribed_at, updated_at)
        OUTPUT INSERTED.*
        VALUES (@email, 1, @source, SYSUTCDATETIME(), SYSUTCDATETIME())
      `);
    return { subscriber: inserted.recordset[0], created: true };
  },

  async getActiveNewsletterSubscribers() {
    const p = await getActivePool();
    const res = await p
      .request()
      .query("SELECT id, email, source, subscribed_at FROM NewsletterSubscribers WHERE is_active = 1 ORDER BY subscribed_at DESC");
    return res.recordset;
  },

  async getActiveCustomerEmails() {
    const p = await getActivePool();
    const res = await p
      .request()
      .query("SELECT id, name, email FROM Users WHERE role = 'customer' AND is_active = 1 AND email IS NOT NULL ORDER BY created_at DESC");
    return res.recordset;
  },
};
