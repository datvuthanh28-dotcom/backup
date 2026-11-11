import bcrypt from "bcryptjs";
import { connectDB, db } from "../config/db.js";
import { allProducts } from "../../src/data/products.js";
import { initialVariantStock } from "./catalog-stock-policy.js";

const DEFAULT_USERS = [
  {
    id: "usr_admin_01",
    name: "Văn Hưng (Quản Trị Viên)",
    email: "vanhung29993@gmail.com",
    rawPassword: "admin123",
    role: "admin",
    phone: "0901234567",
    is_active: true,
  },
  {
    id: "usr_staff_01",
    name: "Lê Hoàng Yến (Vận Hành)",
    email: "staff@maisonrue.com",
    rawPassword: "staff123",
    role: "staff",
    phone: "0912345678",
    is_active: true,
  },
  {
    id: "usr_staff_02",
    name: "Trần Minh Khoa (Kho Vận)",
    email: "staff2@maisonrue.com",
    rawPassword: "staff123",
    role: "staff",
    phone: "0923456789",
    is_active: true,
  },
  {
    id: "usr_staff_inactive",
    name: "Phạm Thu Trang (Tạm Khóa)",
    email: "phamthutrang.maisonrue@gmail.com",
    rawPassword: "staff123",
    role: "staff",
    phone: "0934567890",
    is_active: false,
  },
  {
    id: "usr_cust_01",
    name: "Vũ Thành Đạt",
    email: "vudat9532@gmail.com",
    rawPassword: "customer123",
    role: "customer",
    phone: "0987654321",
    is_active: true,
  },
];

const DEMO_RETURN_REQUESTS = [
  {
    id: "RET-1793990899435-BOFA6", orderId: "MR-2024-00101", productId: 1,
    productName: "Cashmere Cardigan", color: "BEIGE", size: "ONE SIZE", price: 6490000,
    type: "refund", reason: "changed_mind", detail: null, amount: 6490000,
    status: "manual_review", decision: "Cần kiểm tra tình trạng sản phẩm trước khi duyệt hoàn tiền.",
  },
  {
    id: "RET-1793990861514-34SNC", orderId: "MR-2026-24663", productId: 107,
    productName: "Baby Cashmere Crewneck Sweater", color: "Brown", size: "S", price: 4890000,
    type: "refund", reason: "wrong_size_sent", detail: null, amount: 4890000,
    status: "return_authorized", decision: "Sản phẩm đủ điều kiện tiếp nhận để kiểm tra.",
  },
  {
    id: "RET-1793989608164-HBI0B", orderId: "MR-TEST-DEL-002", productId: 113,
    productName: "Linen Classic Long-Sleeve Shirt", color: "White", size: "L", price: 2390000,
    type: "refund", reason: "other", detail: "bi hu khoá", amount: 2390000,
    status: "inspection_passed", decision: "Đã kiểm tra và xác nhận sản phẩm đủ điều kiện hoàn tiền.",
  },
  {
    id: "RET-1793989568118-GYYGO", orderId: "MR-TEST-DEL-003", productId: 127,
    productName: "Suede Penny Loafers", color: "Dark Brown", size: "42", price: 2390000,
    type: "refund", reason: "other", detail: "bị bạc màu", amount: 2390000,
    status: "auto_declined", decision: "Yêu cầu không đáp ứng điều kiện hoàn tiền tự động.",
  },
  {
    id: "RET-1793989273993-H9HMF", orderId: "MR-2026-24663", productId: 107,
    productName: "Baby Cashmere Crewneck Sweater", color: "Brown", size: "S", price: 4890000,
    type: "exchange", reason: "wrong_color", detail: null, amount: 4890000,
    status: "return_authorized", decision: "Sản phẩm đủ điều kiện tiếp nhận để đổi hàng.",
  },
];

async function seedDemoReturnRequests(pool) {
  console.log("[Seed] Checking demo return and refund requests...");
  for (const record of DEMO_RETURN_REQUESTS) {
    const existing = await pool.request().input("id", record.id).query("SELECT id FROM ReturnRequests WHERE id=@id");
    if (existing.recordset.length) continue;

    const existingOrder = await pool.request().input("id", record.orderId).query("SELECT id FROM Orders WHERE id=@id");
    if (!existingOrder.recordset.length) {
      await pool.request()
        .input("id", record.orderId).input("customer_id", "usr_cust_01")
        .input("customer_name", "Vũ Thành Đạt").input("customer_email", "vudat9532@gmail.com")
        .input("customer_phone", "0987654321").input("shipping_address", "128 Đồng Khởi, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh")
        .input("total_amount", record.amount).input("notes", "Demo order for return workflow")
        .query(`INSERT INTO Orders(id,customer_id,customer_name,customer_email,customer_phone,shipping_address,shipping_fee,total_amount,order_status,stock_deducted,notes,created_at,updated_at)
          VALUES(@id,@customer_id,@customer_name,@customer_email,@customer_phone,@shipping_address,0,@total_amount,'delivered',1,@notes,GETDATE(),GETDATE())`);
    }

    let item = await pool.request().input("order_id", record.orderId).input("product_id", record.productId).input("color", record.color).input("size", record.size)
      .query("SELECT TOP 1 id FROM OrderItems WHERE order_id=@order_id AND product_id=@product_id AND selected_color=@color AND selected_size=@size ORDER BY id");
    let orderItemId = item.recordset[0]?.id;
    if (!orderItemId) {
      const inserted = await pool.request()
        .input("order_id", record.orderId).input("product_id", record.productId).input("name", record.productName)
        .input("color", record.color).input("size", record.size).input("price", record.price).input("image", null)
        .query(`INSERT INTO OrderItems(order_id,product_id,product_name,selected_color,selected_size,quantity,unit_price,total_price,image_url,created_at)
          OUTPUT INSERTED.id VALUES(@order_id,@product_id,@name,@color,@size,1,@price,@price,@image,GETDATE())`);
      orderItemId = inserted.recordset[0].id;
    }

    await pool.request()
      .input("id", record.id).input("order_id", record.orderId).input("item_id", orderItemId).input("customer_id", "usr_cust_01")
      .input("email", "vudat9532@gmail.com").input("type", record.type).input("reason", record.reason).input("detail", record.detail)
      .input("amount", record.amount).input("status", record.status).input("decision", record.decision)
      .query(`INSERT INTO ReturnRequests(id,order_id,order_item_id,customer_id,customer_email,request_type,reason_code,reason_detail,requested_quantity,exchange_size,exchange_color,requested_amount,status,decision_reason,return_deadline,created_at,updated_at)
        VALUES(@id,@order_id,@item_id,@customer_id,@email,@type,@reason,@detail,1,NULL,NULL,@amount,@status,@decision,DATEADD(day,14,GETDATE()),GETDATE(),GETDATE())`);
    console.log(`[Seed] Created return request: ${record.id}`);
  }
}

export async function runSeed() {
  console.log("==================================================");
  console.log("MAISON RUE — Idempotent Database Seed Execution");
  console.log("==================================================");

  await connectDB();

  const pool = await connectDB();

  // 1. Seed Users with bcrypt hashes
  console.log("[Seed] Checking & seeding default accounts...");
  for (const u of DEFAULT_USERS) {
    const existing = (await db.findUserById(u.id)) || (await db.findUserByEmail(u.email));
    if (!existing) {
      const password_hash = bcrypt.hashSync(u.rawPassword, 10);
      await db.createUser({
        id: u.id,
        name: u.name,
        email: u.email,
        password_hash,
        role: u.role,
        phone: u.phone,
        is_active: u.is_active,
      });
      console.log(`[Seed] Created ${u.role.toUpperCase()} account: ${u.email}`);
    } else {
      await pool.request().input("id", u.id).input("email", u.email).input("name", u.name).input("role", u.role).query("UPDATE Users SET email = @email, name = @name, role = @role WHERE id = @id");
      console.log(`[Seed] Synced account: ${u.email} (${u.role})`);
    }
  }

  // 2. Seed Products
  console.log("[Seed] Checking & seeding catalog products...");
  for (const [productIndex, p] of allProducts.entries()) {
    const variantStocks = p.variants.map((_, variantIndex) => initialVariantStock(productIndex, variantIndex));
    const stock = variantStocks.reduce((sum, value) => sum + value, 0);
    await pool.request()
      .input("id", p.id)
      .input("product_code", p.productCode)
      .input("name", p.name)
      .input("price", p.price)
      .input("category", p.category)
      .input("gender", p.gender)
      .input("images_json", JSON.stringify(p.images))
      .input("colors_json", JSON.stringify(p.colors))
      .input("color_images_json", JSON.stringify(p.colorImages))
      .input("description", p.description)
      .input("collection_name", p.collection)
      .input("collections_json", JSON.stringify(p.collections))
      .input("material", p.material)
      .input("stock", stock)
      .input("min_alert", 3)
      .query(`
        MERGE Products AS target
        USING (SELECT @id AS id) AS source ON target.id=source.id
        WHEN MATCHED THEN UPDATE SET product_code=@product_code, name=@name, price=@price, category=@category,
          gender=@gender, images_json=@images_json, colors_json=@colors_json, color_images_json=@color_images_json,
          description=@description, collection_name=@collection_name, collections_json=@collections_json, material=@material, stock=@stock, min_alert=@min_alert, is_active=1, updated_at=GETDATE()
        WHEN NOT MATCHED THEN INSERT
          (id, product_code, name, price, category, gender, images_json, colors_json, color_images_json, description, collection_name, collections_json, material, stock, min_alert, is_active, created_at, updated_at)
          VALUES (@id, @product_code, @name, @price, @category, @gender, @images_json, @colors_json, @color_images_json, @description, @collection_name, @collections_json, @material, @stock, @min_alert, 1, GETDATE(), GETDATE());
      `);

    for (const [variantIndex, variant] of p.variants.entries()) {
      await pool.request()
        .input("id", variant.id)
        .input("product_id", p.id)
        .input("sku", variant.sku)
        .input("color_name", variant.color)
        .input("size_name", variant.size)
        .input("price", variant.price)
        .input("stock", variantStocks[variantIndex])
        .input("min_stock", variant.lowStockThreshold)
        .input("max_stock", variant.maxStockThreshold)
        .query(`
          MERGE ProductVariants AS target
          USING (SELECT @product_id AS product_id, @color_name AS color_name, @size_name AS size_name) AS source
            ON target.product_id=source.product_id AND target.color_name=source.color_name AND target.size_name=source.size_name
          WHEN MATCHED THEN UPDATE SET sku=@sku, price=@price, stock_quantity=@stock,
            low_stock_threshold=@min_stock, max_stock_threshold=@max_stock, is_active=1, updated_at=GETDATE()
          WHEN NOT MATCHED THEN INSERT
            (id, product_id, sku, color_name, size_name, price, stock_quantity, low_stock_threshold, max_stock_threshold, is_active)
            VALUES (@id, @product_id, @sku, @color_name, @size_name, @price, @stock, @min_stock, @max_stock, 1);
        `);
    }
    console.log(`[Seed] Synced product: ${p.productCode} — ${p.name} (${p.variants.length} SKU)`);
  }

  // 3. Seed Initial Realistic Orders with Verified Payments
  console.log("[Seed] Checking & seeding demo operational orders...");
  const existingOrders = await db.getAllOrders();
  if (existingOrders.length === 0) {
    // Delivered Order (Verified Paid Revenue)
    await db.createOrderWithTransaction({
      orderData: {
        id: "MR-2024-00101",
        customer_id: "usr_cust_01",
        customer_name: "Vũ Thành Đạt",
        customer_email: "vudat9532@gmail.com",
        customer_phone: "0987654321",
        shipping_address: "128 Đồng Khởi, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh",
        shipping_fee: 0,
        total_amount: 7280000,
        notes: "Giao giờ hành chính, đóng hộp quà",
      },
      items: [
        {
          id: 109,
          name: "Cashmere Button Cardigan",
          price: 4890000,
          quantity: 1,
          selectedColor: "Beige",
          selectedSize: "S",
          variantId: "v-109-beige-s",
          sku: "MR-109-BEIGE-S",
          image: "image/Cashmere Cardigan - Men/BEIGE/1.png",
        },
        {
          id: 113,
          name: "Linen Classic Long-Sleeve Shirt",
          price: 2390000,
          quantity: 1,
          selectedColor: "Brown",
          selectedSize: "S",
          variantId: "v-113-brown-s",
          sku: "MR-113-BROWN-S",
          image: "image/Linen Shirt - Men/1.png",
        },
      ],
      paymentData: { method: "cod" },
    });

    // Advance to confirmed -> processing -> shipping -> delivered
    await db.updateOrderStatusWithValidation({
      orderId: "MR-2024-00101",
      newStatus: "confirmed",
      note: "Đã liên hệ quý khách xác nhận đơn.",
      updatedBy: "Lê Hoàng Yến (Staff)",
    });
    await db.updateOrderStatusWithValidation({
      orderId: "MR-2024-00101",
      newStatus: "processing",
      note: "Kho đóng gói hoàn tất.",
      updatedBy: "Trần Minh Khoa (Staff)",
    });
    await db.updateOrderStatusWithValidation({
      orderId: "MR-2024-00101",
      newStatus: "shipping",
      note: "Đã bàn giao đơn vị vận chuyển cao cấp.",
      updatedBy: "Trần Minh Khoa (Staff)",
    });
    await db.updateOrderStatusWithValidation({
      orderId: "MR-2024-00101",
      newStatus: "delivered",
      note: "Khách hàng đã nhận hàng và thanh toán COD thành công.",
      updatedBy: "Đơn vị vận chuyển",
    });

    // Shipping Order (In-flight)
    await db.createOrderWithTransaction({
      orderData: {
        id: "MR-2024-00102",
        customer_id: "usr_cust_01",
        customer_name: "Vũ Thành Đạt",
        customer_email: "vudat9532@gmail.com",
        customer_phone: "0987654321",
        shipping_address: "128 Đồng Khởi, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh",
        shipping_fee: 0,
        total_amount: 4890000,
        notes: "Kiểm tra hàng trước khi nhận",
      },
      items: [
        {
          id: 150,
          name: "Baby Cashmere Cardigan",
          price: 4890000,
          quantity: 1,
          selectedColor: "Beige",
          selectedSize: "XS",
          variantId: "v-150-beige-xs",
          sku: "MR-150-BEIGE-XS",
          image: "image/Cashmere Cardigan - Women/BEIGE/1.png",
        },
      ],
      paymentData: { method: "bank_transfer" },
    });
    await db.updateOrderStatusWithValidation({
      orderId: "MR-2024-00102",
      newStatus: "confirmed",
      note: "Xác nhận chuyển khoản Vietcombank.",
      updatedBy: "Lê Hoàng Yến (Staff)",
    });
    await db.updateOrderStatusWithValidation({
      orderId: "MR-2024-00102",
      newStatus: "processing",
      note: "Kiểm định chất lượng len cashmere.",
      updatedBy: "Trần Minh Khoa (Staff)",
    });
    await db.updateOrderStatusWithValidation({
      orderId: "MR-2024-00102",
      newStatus: "shipping",
      note: "Đang trên lộ trình giao tận tay.",
      updatedBy: "Lê Hoàng Yến (Staff)",
    });

    // Pending Order (New)
    await db.createOrderWithTransaction({
      orderData: {
        id: "MR-2024-00105",
        customer_id: "usr_cust_01",
        customer_name: "Vũ Thành Đạt",
        customer_email: "vudat9532@gmail.com",
        customer_phone: "0987654321",
        shipping_address: "128 Đồng Khởi, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh",
        shipping_fee: 0,
        total_amount: 2390000,
        notes: "Giao chiều",
      },
      items: [
        {
          id: 139,
          name: "Suede Baseball Cap",
          price: 2390000,
          quantity: 1,
          selectedColor: "Dark Brown",
          selectedSize: "One Size",
          variantId: "v-139-dark-brown-one-size",
          sku: "MR-139-DARK-BROWN-ONE-SIZE",
          image: "image/Suede Baseball Cap/DARK-CHOCOLATE-BROWN/1.jpg",
        },
      ],
      paymentData: { method: "cod" },
    });

    console.log("[Seed] Initial orders and audit logs created successfully.");
  } else {
    console.log(`[Seed] Orders already exist in database (${existingOrders.length} orders).`);
  }

  await seedDemoReturnRequests(pool);

  console.log("==================================================");
  console.log("Maison Rue Database Seed Completed Successfully!");
  console.log("==================================================");
}

// If run directly via node
if (process.argv[1]?.endsWith("seed.js")) {
  runSeed().catch((err) => {
    console.error("[Seed] Error executing seed script:", err);
    process.exit(1);
  });
}

