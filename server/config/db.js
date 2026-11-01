import sql from "mssql";
import dotenv from "dotenv";

dotenv.config();

const sqlConfig = {
  user: process.env.DB_USER || "sa",
  password: process.env.DB_PASSWORD || "YourStrongPassword123!",
  database: process.env.DB_NAME || "MaisonRueDB",
  server: process.env.DB_SERVER || "localhost",
  port: parseInt(process.env.DB_PORT, 10) || 1435,
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
    throw new Error(errorMsg);
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
    const res = await p.request().query("SELECT * FROM Products ORDER BY id ASC");
    return res.recordset.map((r) => ({
      ...r,
      images: JSON.parse(r.images_json),
      colors: JSON.parse(r.colors_json),
      colorImages: JSON.parse(r.color_images_json),
    }));
  },

  async getProductById(id) {
    const p = await getActivePool();
    const numId = Number(id);
    const res = await p
      .request()
      .input("id", sql.Int, numId)
      .query("SELECT * FROM Products WHERE id = @id");
    const r = res.recordset[0];
    if (!r) return null;
    return {
      ...r,
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

  async createOrderWithTransaction({ orderData, items, paymentData }) {
    const p = await getActivePool();
    const transaction = new sql.Transaction(p);
    await transaction.begin();
    try {
      // 1. Check stock availability for all items
      for (const item of items) {
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
        .input("order_status", sql.NVarChar, "pending")
        .input("stock_deducted", sql.Bit, 1)
        .input("notes", sql.NVarChar, orderData.notes || null)
        .query(`
          INSERT INTO Orders (id, customer_id, customer_name, customer_email, customer_phone, shipping_address, shipping_fee, total_amount, order_status, stock_deducted, notes, created_at, updated_at)
          VALUES (@id, @customer_id, @customer_name, @customer_email, @customer_phone, @shipping_address, @shipping_fee, @total_amount, @order_status, @stock_deducted, @notes, GETDATE(), GETDATE())
        `);

      // 3. Insert OrderItems & Deduct stock & Record movements
      for (const item of items) {
        await transaction
          .request()
          .input("order_id", sql.NVarChar, orderData.id)
          .input("product_id", sql.Int, item.id)
          .input("product_name", sql.NVarChar, item.name)
          .input("selected_color", sql.NVarChar, item.selectedColor || "Tiêu chuẩn")
          .input("quantity", sql.Int, item.quantity)
          .input("unit_price", sql.Decimal(18, 0), item.price)
          .input("total_price", sql.Decimal(18, 0), item.price * item.quantity)
          .input("image_url", sql.NVarChar, item.image || null)
          .query(`
            INSERT INTO OrderItems (order_id, product_id, product_name, selected_color, quantity, unit_price, total_price, image_url, created_at)
            VALUES (@order_id, @product_id, @product_name, @selected_color, @quantity, @unit_price, @total_price, @image_url, GETDATE())
          `);

        await transaction
          .request()
          .input("id", sql.Int, item.id)
          .input("qty", sql.Int, item.quantity)
          .query("UPDATE Products SET stock = stock - @qty, updated_at = GETDATE() WHERE id = @id");

        const updatedProd = await transaction
          .request()
          .input("id", sql.Int, item.id)
          .query("SELECT stock FROM Products WHERE id = @id");

        await transaction
          .request()
          .input("product_id", sql.Int, item.id)
          .input("movement_type", sql.NVarChar, "order_deduction")
          .input("quantity_change", sql.Int, -item.quantity)
          .input("resulting_stock", sql.Int, updatedProd.recordset[0].stock)
          .input("reference_id", sql.NVarChar, orderData.id)
          .input("note", sql.NVarChar, `Đơn hàng #${orderData.id}`)
          .input("performed_by", sql.NVarChar, orderData.customer_name)
          .query(`
            INSERT INTO InventoryMovements (product_id, movement_type, quantity_change, resulting_stock, reference_id, note, performed_by, created_at)
            VALUES (@product_id, @movement_type, @quantity_change, @resulting_stock, @reference_id, @note, @performed_by, GETDATE())
          `);
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
      return this.getOrderById(orderData.id);
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
            .input("movement_type", sql.NVarChar, "order_cancellation_restore")
            .input("quantity_change", sql.Int, item.quantity)
            .input("resulting_stock", sql.Int, updatedProd.recordset[0].stock)
            .input("reference_id", sql.NVarChar, orderId)
            .input("note", sql.NVarChar, `Hoàn tồn kho do hủy đơn #${orderId}`)
            .input("performed_by", sql.NVarChar, updatedBy)
            .query(`
              INSERT INTO InventoryMovements (product_id, movement_type, quantity_change, resulting_stock, reference_id, note, performed_by, created_at)
              VALUES (@product_id, @movement_type, @quantity_change, @resulting_stock, @reference_id, @note, @performed_by, GETDATE())
            `);
        }
        stockDeducted = false;
      }

      await transaction
        .request()
        .input("id", sql.NVarChar, orderId)
        .input("order_status", sql.NVarChar, newStatus)
        .input("stock_deducted", sql.Bit, stockDeducted ? 1 : 0)
        .query("UPDATE Orders SET order_status = @order_status, stock_deducted = @stock_deducted, updated_at = GETDATE() WHERE id = @id");

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

  // ==========================================
  // REVENUE & AUDIT REPORTING (Strictly Verified Payments)
  // ==========================================
  async getRevenueReport() {
    const allOrders = await this.getAllOrders();

    // ONLY orders with verified payment (payment.payment_status === 'paid') contribute to actual collected revenue
    let actualCollectedRevenue = 0;
    let pendingVerificationRevenue = 0;
    let refundPendingRevenue = 0;
    let refundedRevenue = 0;
    let unpaidRevenue = 0;

    const categorySales = { men: 0, women: 0, accessories: 0 };
    const productSalesMap = {};

    allOrders.forEach((order) => {
      const pmt = order.payment;
      const status = pmt ? pmt.payment_status : "unpaid";

      if (status === "paid") {
        actualCollectedRevenue += order.total_amount;
        order.items.forEach((item) => {
          const cat = (item.product_name || "").toLowerCase().includes("men")
            ? "men"
            : (item.product_name || "").toLowerCase().includes("women")
            ? "women"
            : "accessories";
          categorySales[cat] = (categorySales[cat] || 0) + item.total_price;

          if (!productSalesMap[item.product_id]) {
            productSalesMap[item.product_id] = {
              id: item.product_id,
              name: item.product_name,
              total_quantity: 0,
              total_revenue: 0,
              image_url: item.image_url,
            };
          }
          productSalesMap[item.product_id].total_quantity += item.quantity;
          productSalesMap[item.product_id].total_revenue += item.total_price;
        });
      } else if (status === "pending_verification") {
        pendingVerificationRevenue += order.total_amount;
      } else if (status === "refund_pending") {
        refundPendingRevenue += order.total_amount;
      } else if (status === "refunded") {
        refundedRevenue += order.total_amount;
      } else {
        unpaidRevenue += order.total_amount;
      }
    });

    const topSellingProducts = Object.values(productSalesMap).sort((a, b) => b.total_revenue - a.total_revenue);
    const paidOrdersCount = allOrders.filter((o) => o.payment?.payment_status === "paid").length;

    return {
      actualCollectedRevenue,
      pendingVerificationRevenue,
      refundPendingRevenue,
      unpaidRevenue,
      refundedRevenue,
      totalOrders: allOrders.length,
      paidOrdersCount,
      averageOrderValue: paidOrdersCount > 0 ? Math.round(actualCollectedRevenue / paidOrdersCount) : 0,
      categorySales,
      topSellingProducts,
      ordersByStatus: {
        pending: allOrders.filter((o) => o.order_status === "pending").length,
        confirmed: allOrders.filter((o) => o.order_status === "confirmed").length,
        processing: allOrders.filter((o) => o.order_status === "processing").length,
        shipping: allOrders.filter((o) => o.order_status === "shipping").length,
        delivered: allOrders.filter((o) => o.order_status === "delivered").length,
        cancelled: allOrders.filter((o) => o.order_status === "cancelled").length,
      },
    };
  },
};
