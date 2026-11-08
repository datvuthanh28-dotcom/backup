import bcrypt from "bcryptjs";
import { connectDB, db } from "../config/db.js";
import { allProducts } from "../../src/data/products.js";
import { initialVariantStock } from "./catalog-stock-policy.js";

const DEFAULT_USERS = [
  {
    id: "usr_admin_01",
    name: "Quản Trị Viên Maison Rue",
    email: "vanhung29993@gmail.com",
    rawPassword: "admin123",
    role: "admin",
    phone: "0901234567",
    is_active: true,
  },
  {
    id: "usr_admin_demo",
    name: "Quản Trị Viên Demo",
    email: "admin@maisonrue.com",
    rawPassword: "admin123",
    role: "admin",
    phone: "0901234567",
    is_active: true,
  },
  {
    id: "usr_staff_01",
    name: "Lê Hoàng Yến (Vận Hành)",
    email: "staffmaisonrue@gmail.com",
    rawPassword: "staff123",
    role: "staff",
    phone: "0912345678",
    is_active: true,
  },
  {
    id: "usr_staff_demo",
    name: "Nhân Viên Vận Hành Demo",
    email: "staff@maisonrue.com",
    rawPassword: "staff123",
    role: "staff",
    phone: "0912345678",
    is_active: true,
  },
  {
    id: "usr_staff_02",
    name: "Trần Minh Khoa (Kho Vận)",
    email: "maisonruestaff2@gmail.com",
    rawPassword: "staff123",
    role: "staff",
    phone: "0923456789",
    is_active: true,
  },
  {
    id: "usr_staff2_demo",
    name: "Nhân Viên Kho Demo",
    email: "staff2@maisonrue.com",
    rawPassword: "staff123",
    role: "staff",
    phone: "0923456789",
    is_active: true,
  },
  {
    id: "usr_staff_inactive",
    name: "Phạm Thu Trang (Tạm Khóa)",
    email: "staff.inactive@maisonrue.com",
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
  {
    id: "usr_cust_demo",
    name: "Khách Hàng Demo",
    email: "customer@gmail.com",
    rawPassword: "customer123",
    role: "customer",
    phone: "0987654321",
    is_active: true,
  },
];

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
        customer_name: "Nguyễn Văn An",
        customer_email: "customer@gmail.com",
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
        customer_name: "Nguyễn Văn An",
        customer_email: "customer@gmail.com",
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
        customer_name: "Nguyễn Văn An",
        customer_email: "customer@gmail.com",
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

