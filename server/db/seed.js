import bcrypt from "bcryptjs";
import { connectDB, db } from "../config/db.js";
import productsData from "../../src/data/products.js";

const DEFAULT_USERS = [
  {
    id: "usr_admin_01",
    name: "Quản Trị Viên Maison Rue",
    email: "admin@maisonrue.com",
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
    email: "staff.inactive@maisonrue.com",
    rawPassword: "staff123",
    role: "staff",
    phone: "0934567890",
    is_active: false,
  },
  {
    id: "usr_cust_01",
    name: "Nguyễn Văn An",
    email: "customer@gmail.com",
    rawPassword: "customer123",
    role: "customer",
    phone: "0987654321",
    is_active: true,
  },
];

const INITIAL_STOCKS = {
  1: 18,
  2: 4,  // Low stock
  3: 12,
  4: 2,  // Low stock
  5: 15,
  6: 0,  // Out of stock
  7: 22,
  8: 9,
  9: 30,
};

export async function runSeed() {
  console.log("==================================================");
  console.log("MAISON RUE — Idempotent Database Seed Execution");
  console.log("==================================================");

  await connectDB();

  // 1. Seed Users with bcrypt hashes
  console.log("[Seed] Checking & seeding default accounts...");
  for (const u of DEFAULT_USERS) {
    const existing = await db.findUserByEmail(u.email);
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
      console.log(`[Seed] Account already exists: ${u.email} (${u.role})`);
    }
  }

  // 2. Seed Products
  console.log("[Seed] Checking & seeding catalog products...");
  const allProds = [
    ...productsData.men,
    ...productsData.women,
    ...productsData.accessories,
  ];

  for (const p of allProds) {
    const existing = await db.getProductById(p.id);
    if (!existing) {
      const stock = INITIAL_STOCKS[p.id] ?? 10;
      const pool = await connectDB();
      await pool
        .request()
        .input("id", p.id)
        .input("product_code", `MR-${String(p.id).padStart(3, "0")}`)
        .input("name", p.name)
        .input("price", p.price)
        .input("category", p.category)
        .input("gender", p.gender)
        .input("images_json", JSON.stringify(p.images))
        .input("colors_json", JSON.stringify(p.colors))
        .input("color_images_json", JSON.stringify(p.colorImages))
        .input("description", p.description)
        .input("stock", stock)
        .input("min_alert", 5)
        .query(`
          INSERT INTO Products (id, product_code, name, price, category, gender, images_json, colors_json, color_images_json, description, stock, min_alert, created_at, updated_at)
          VALUES (@id, @product_code, @name, @price, @category, @gender, @images_json, @colors_json, @color_images_json, @description, @stock, @min_alert, GETDATE(), GETDATE())
        `);
      console.log(`[Seed] Seeded product: ${p.name} (ID: ${p.id}, Stock: ${stock})`);
    }
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
        total_amount: 8880000,
        notes: "Giao giờ hành chính, đóng hộp quà",
      },
      items: [
        {
          id: 1,
          name: "Cashmere Cardigan",
          price: 6490000,
          quantity: 1,
          selectedColor: "BEIGE",
          image: "image/Cashmere Cardigan - Men/BEIGE/1.png",
        },
        {
          id: 3,
          name: "Linen Shirt",
          price: 2390000,
          quantity: 1,
          selectedColor: "IVORY WHITE",
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
        total_amount: 6290000,
        notes: "Kiểm tra hàng trước khi nhận",
      },
      items: [
        {
          id: 5,
          name: "Cashmere Cardigan",
          price: 6290000,
          quantity: 1,
          selectedColor: "GRAPEFRUIT SODA",
          image: "image/Cashmere Cardigan - Women/GRAPEFRUIT SODA/1.png",
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
        total_amount: 2190000,
        notes: "Giao chiều",
      },
      items: [
        {
          id: 9,
          name: "Suede Baseball Cap",
          price: 2190000,
          quantity: 1,
          selectedColor: "DEEP-TEAL",
          image: "image/Suede Baseball Cap/DEEP-TEAL/1.png",
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

