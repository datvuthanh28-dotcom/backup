import sql from "mssql";
import dotenv from "dotenv";
import { allProducts as catalogProducts } from "../../src/data/products.js";

dotenv.config();

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
    }
    if (fields.is_active !== undefined) {
      req.input("is_active", sql.Bit, fields.is_active ? 1 : 0);
      updates.push("is_active = @is_active");
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
    const res = await p.request().query("SELECT * FROM Products WHERE is_active = 1 ORDER BY id ASC");
    const variantRes = await p.request().query("SELECT * FROM ProductVariants WHERE is_active = 1 ORDER BY product_id, color_name, size_name");
    return res.recordset.map((r) => {
      const catalog = catalogProducts.find((product) => product.id === r.id) || {};
      const variants = variantRes.recordset.filter((variant) => variant.product_id === r.id).map((variant) => ({ id: variant.id, sku: variant.sku, color: variant.color_name, size: variant.size_name, price: Number(variant.price), costPrice: Number(variant.cost_price || 0), floorPrice: Number(variant.floor_price || 0), stock: variant.stock_quantity, lowStockThreshold: variant.low_stock_threshold, maxStockThreshold: variant.max_stock_threshold }))
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
      .query("SELECT * FROM Products WHERE id = @id AND is_active = 1");
    const r = res.recordset[0];
    if (!r) return null;
    const catalog = catalogProducts.find((product) => product.id === r.id) || {};
    const variantRes = await p.request().input("product_id", sql.Int, numId).query("SELECT * FROM ProductVariants WHERE product_id=@product_id AND is_active=1 ORDER BY color_name, size_name");
    const variants = variantRes.recordset.map((variant) => ({ id: variant.id, sku: variant.sku, color: variant.color_name, size: variant.size_name, price: Number(variant.price), costPrice: Number(variant.cost_price || 0), floorPrice: Number(variant.floor_price || 0), stock: variant.stock_quantity, lowStockThreshold: variant.low_stock_threshold, maxStockThreshold: variant.max_stock_threshold }))
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
        .query("SELECT stock FROM Products WHERE id = @id");
      const currentStock = prodRes.recordset[0]?.stock || 0;
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
        .query(`SELECT id, sku, color_name, size_name, stock_quantity, low_stock_threshold, max_stock_threshold
                FROM ProductVariants WITH (UPDLOCK, ROWLOCK)
                WHERE id=@variant_id AND product_id=@product_id AND is_active=1`);
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
        .input("resulting_stock", sql.Int, totalStock)
        .input("reference_id", sql.NVarChar, variant.sku)
        .input("note", sql.NVarChar, `${note} | SKU ${variant.sku} | ${variant.color_name} / ${variant.size_name} | Min ${variant.low_stock_threshold}→${parsedMinStock} | Max ${variant.max_stock_threshold}→${parsedMaxStock}`)
        .input("performed_by", sql.NVarChar, performedBy)
        .query(`INSERT INTO InventoryMovements
                (product_id, variant_id, movement_type, quantity_change, resulting_stock, reference_id, note, performed_by, created_at)
                VALUES (@product_id, @variant_id, @movement_type, @quantity_change, @resulting_stock, @reference_id, @note, @performed_by, GETDATE())`);

      await transaction.commit();
      return { success: true, stock: parsedStock, minStock: parsedMinStock, maxStock: parsedMaxStock, totalStock, variantId, sku: variant.sku };
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async updateVariantPricing(productId, variantId, costPrice, floorPrice) {
    const p = await getActivePool();
    const result = await p.request().input("product_id", sql.Int, Number(productId)).input("variant_id", sql.NVarChar, variantId).query("SELECT id,price FROM ProductVariants WHERE id=@variant_id AND product_id=@product_id AND is_active=1");
    if (!result.recordset.length) throw new Error("Không tìm thấy SKU cần cập nhật.");
    const sellingPrice = Number(result.recordset[0].price);
    if (costPrice < 0 || floorPrice < costPrice || floorPrice > sellingPrice) throw new Error("Giá phải thỏa mãn: 0 ≤ giá vốn ≤ giá sàn ≤ giá bán.");
    await p.request().input("product_id", sql.Int, Number(productId)).input("variant_id", sql.NVarChar, variantId).input("cost", sql.Decimal(18,0), costPrice).input("floor", sql.Decimal(18,0), floorPrice).query("UPDATE ProductVariants SET cost_price=@cost,floor_price=@floor,updated_at=GETDATE() WHERE id=@variant_id AND product_id=@product_id");
    return { costPrice, floorPrice, sellingPrice };
  },

  async getAllProductsAdmin() {
    const p = await getActivePool();
    const res = await p.request().query("SELECT * FROM Products ORDER BY id DESC");
    const variantRes = await p.request().query("SELECT * FROM ProductVariants ORDER BY product_id, color_name, size_name");
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
    if (!Array.isArray(variants) || variants.length === 0) {
      throw new Error("Sản phẩm phải có ít nhất một SKU được khai báo rõ ràng.");
    }

    const normalizedVariants = variants.map((variant, index) => {
      const color = String(variant.color || "").trim();
      const size = String(variant.size || "").trim();
      const sku = String(variant.sku || "").trim().toUpperCase();
      const variantPrice = Number(variant.price);
      const costPrice = Number(variant.costPrice);
      const floorPrice = Number(variant.floorPrice);
      const stock = Number(variant.stock);
      const minStock = Number(variant.minStock);
      const maxStock = Number(variant.maxStock);
      if (!sku || !color || !size) throw new Error(`SKU dòng ${index + 1} phải có mã SKU, màu sắc và kích cỡ.`);
      if (!(variantPrice > 0) || costPrice < 0 || floorPrice < costPrice || floorPrice > variantPrice) {
        throw new Error(`SKU ${sku}: giá phải thỏa mãn 0 ≤ giá vốn ≤ giá sàn ≤ giá bán.`);
      }
      if (![stock, minStock, maxStock].every(Number.isInteger) || stock < 0 || minStock < 0 || maxStock <= minStock) {
        throw new Error(`SKU ${sku}: tồn kho phải là số nguyên không âm và mức tối đa phải lớn hơn mức tối thiểu.`);
      }
      return { ...variant, sku, color, size, price: variantPrice, costPrice, floorPrice, stock, minStock, maxStock };
    });
    if (new Set(normalizedVariants.map((variant) => variant.sku)).size !== normalizedVariants.length) {
      throw new Error("Danh sách có mã SKU trùng nhau.");
    }

    const checkCode = await p.request().input("code", sql.NVarChar, productCode.trim().toUpperCase()).query("SELECT id FROM Products WHERE product_code = @code");
    if (checkCode.recordset.length) {
      throw new Error(`Mã sản phẩm "${productCode.trim().toUpperCase()}" đã tồn tại trên hệ thống.`);
    }

    const transaction = new sql.Transaction(p);
    await transaction.begin();
    try {
      const nextIdRes = await transaction.request().query("SELECT COALESCE(MAX(id), 100) + 1 AS next_id FROM Products");
      const nextId = nextIdRes.recordset[0].next_id;

      const totalStock = normalizedVariants.reduce((sum, v) => sum + v.stock, 0);

      await transaction.request()
        .input("id", sql.Int, nextId)
        .input("product_code", sql.NVarChar, productCode.trim().toUpperCase())
        .input("name", sql.NVarChar, name.trim())
        .input("price", sql.Decimal(18, 0), Number(price))
        .input("category", sql.NVarChar, category.trim())
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

      for (let i = 0; i < normalizedVariants.length; i++) {
        const v = normalizedVariants[i];
        const color = v.color;
        const size = v.size;
        const variantId = v.id || `v-${nextId}-${color.toLowerCase().replace(/[^a-z0-9]/g, "")}-${size.toLowerCase()}`;
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
            .input("reference_id", sql.NVarChar, sku)
            .input("note", sql.NVarChar, `Khởi tạo tồn kho ban đầu cho SKU ${sku}`)
            .input("performed_by", sql.NVarChar, actor)
            .query(`
              INSERT INTO InventoryMovements (product_id, variant_id, movement_type, quantity_change, resulting_stock, reference_id, note, performed_by, created_at)
              VALUES (@product_id, @variant_id, @movement_type, @quantity_change, @resulting_stock, @reference_id, @note, @performed_by, GETDATE())
            `);
        }
      }

      await transaction.commit();
      return { success: true, id: nextId, productCode: productCode.trim().toUpperCase() };
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
    const prodRes = await p.request().input("id", sql.Int, numProductId).query("SELECT id, product_code, price FROM Products WHERE id = @id");
    if (!prodRes.recordset.length) throw new Error("Không tìm thấy sản phẩm.");
    const prod = prodRes.recordset[0];

    const color = String(data.color || "Standard").trim();
    const size = String(data.size || "M").trim();
    const variantId = data.id || `v-${numProductId}-${color.toLowerCase().replace(/[^a-z0-9]/g, "")}-${size.toLowerCase()}`;
    const sku = data.sku || `${prod.product_code}-${color.toUpperCase().replace(/[^A-Z0-9]/g, "")}-${size.toUpperCase()}`;

    const checkSku = await p.request().input("sku", sql.NVarChar, sku).query("SELECT id FROM ProductVariants WHERE sku = @sku");
    if (checkSku.recordset.length) throw new Error(`SKU "${sku}" đã tồn tại trên hệ thống.`);

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

    const r = existing.recordset[0];
    const color = data.color !== undefined ? String(data.color).trim() : r.color_name;
    const size = data.size !== undefined ? String(data.size).trim() : r.size_name;
    const price = data.price !== undefined ? Number(data.price) : Number(r.price);
    const costPrice = data.costPrice !== undefined ? (data.costPrice != null ? Number(data.costPrice) : null) : (r.cost_price != null ? Number(r.cost_price) : null);
    const floorPrice = data.floorPrice !== undefined ? (data.floorPrice != null ? Number(data.floorPrice) : null) : (r.floor_price != null ? Number(r.floor_price) : null);
    const minStock = data.minStock !== undefined ? Math.max(0, parseInt(data.minStock, 10)) : r.low_stock_threshold;
    const maxStock = data.maxStock !== undefined ? Math.max(minStock + 1, parseInt(data.maxStock, 10)) : r.max_stock_threshold;

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
      SELECT DISTINCT color_name, size_name
      FROM ProductVariants
      WHERE product_id=@product_id AND is_active=1
      ORDER BY color_name, size_name
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
      .input("amount", sql.Decimal(18, 0), record.amount || 0)
      .input("status", sql.NVarChar, record.status)
      .input("decision_reason", sql.NVarChar, record.decisionReason)
      .input("deadline", sql.DateTime2, record.deadline || null)
      .query(`INSERT INTO ReturnRequests(id,order_id,order_item_id,customer_id,customer_email,request_type,reason_code,reason_detail,requested_quantity,exchange_size,exchange_color,requested_amount,status,decision_reason,return_deadline,created_at,updated_at)
        VALUES(@id,@order_id,@order_item_id,@customer_id,@customer_email,@request_type,@reason_code,@reason_detail,@quantity,@exchange_size,@exchange_color,@amount,@status,@decision_reason,@deadline,GETDATE(),GETDATE())`);
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
        .query("UPDATE ProductVariants SET stock_quantity=stock_quantity-@qty,updated_at=GETDATE() OUTPUT inserted.stock_quantity WHERE id=@variant_id");
      const replacementStock = Number(replacementUpdate.recordset[0].stock_quantity);
      const productUpdate = await tx.request().input("product_id", sql.Int, item.product_id).input("qty", sql.Int, quantity)
        .query("UPDATE Products SET stock=stock-@qty,updated_at=GETDATE() OUTPUT inserted.stock WHERE id=@product_id");
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
            .query("SELECT id, sku, stock_quantity FROM ProductVariants WITH (UPDLOCK, ROWLOCK) WHERE id=@variant_id AND is_active=1");
          const variant = variantRes.recordset[0];
          if (!variant || variant.stock_quantity < item.quantity) {
            throw new Error(`Biến thể ${item.sku || item.variantId} không đủ tồn kho.`);
          }
          continue;
        }
        const prodRes = await transaction
          .request()
          .input("id", sql.Int, item.id)
          .query("SELECT id, name, stock FROM Products WHERE id = @id");
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
        .input("stock_deducted", sql.Bit, 1)
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

        if (item.variantId) {
          const varUpdate = await transaction.request().input("variant_id", sql.NVarChar, item.variantId).input("qty", sql.Int, item.quantity)
            .query("UPDATE ProductVariants SET stock_quantity=stock_quantity-@qty, updated_at=GETDATE() OUTPUT inserted.id, inserted.sku, inserted.stock_quantity, inserted.low_stock_threshold, inserted.color_name, inserted.size_name WHERE id=@variant_id");
          if (varUpdate.recordset && varUpdate.recordset[0]) {
            const v = varUpdate.recordset[0];
            if (v.stock_quantity <= v.low_stock_threshold) {
              lowStockAlerts.push({
                productName: item.name,
                sku: v.sku,
                variantInfo: `${v.color_name || ""} - ${v.size_name || ""}`.trim(),
                currentStock: v.stock_quantity,
                minStock: v.low_stock_threshold,
              });
            }
          }
        }
        await transaction.request().input("id", sql.Int, item.id).input("qty", sql.Int, item.quantity)
          .query("UPDATE Products SET stock = stock - @qty, updated_at = GETDATE() WHERE id = @id");

        const updatedProd = await transaction
          .request()
          .input("id", sql.Int, item.id)
          .query("SELECT stock FROM Products WHERE id = @id");

        await transaction
          .request()
          .input("product_id", sql.Int, item.id)
          .input("variant_id", sql.NVarChar, item.variantId || null)
          .input("movement_type", sql.NVarChar, "order_deduction")
          .input("quantity_change", sql.Int, -item.quantity)
          .input("resulting_stock", sql.Int, updatedProd.recordset[0].stock)
          .input("reference_id", sql.NVarChar, orderData.id)
          .input("note", sql.NVarChar, `Đơn hàng #${orderData.id}`)
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

      // When cancelling an order whose stock was deducted, restore the inventory
      if (newStatus === "cancelled" && stockDeducted) {
        for (const item of currentOrder.items) {
          if (item.variant_id) {
            await transaction.request().input("variant_id", sql.NVarChar, item.variant_id).input("qty", sql.Int, item.quantity)
              .query("UPDATE ProductVariants SET stock_quantity=stock_quantity+@qty, updated_at=GETDATE() WHERE id=@variant_id");
          }
          await transaction
            .request()
            .input("id", sql.Int, item.product_id)
            .input("qty", sql.Int, item.quantity)
            .query("UPDATE Products SET stock = stock + @qty, updated_at = GETDATE() WHERE id = @id");

          const updatedProd = await transaction
            .request()
            .input("id", sql.Int, item.product_id)
            .query("SELECT stock FROM Products WHERE id = @id");

          await transaction
            .request()
            .input("product_id", sql.Int, item.product_id)
            .input("variant_id", sql.NVarChar, item.variant_id || null)
            .input("movement_type", sql.NVarChar, "order_cancellation_restore")
            .input("quantity_change", sql.Int, item.quantity)
            .input("resulting_stock", sql.Int, updatedProd.recordset[0].stock)
            .input("reference_id", sql.NVarChar, orderId)
            .input("note", sql.NVarChar, `Hoàn tồn kho do hủy đơn #${orderId}`)
            .input("performed_by", sql.NVarChar, updatedBy)
            .query(`
              INSERT INTO InventoryMovements (product_id, variant_id, movement_type, quantity_change, resulting_stock, reference_id, note, performed_by, created_at)
              VALUES (@product_id, @variant_id, @movement_type, @quantity_change, @resulting_stock, @reference_id, @note, @performed_by, GETDATE())
            `);
        }
        stockDeducted = false;
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
};
