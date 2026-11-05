import bcrypt from "bcryptjs";
import sql from "mssql";
import { connectDB, getPool } from "../config/db.js";

const DEMO_PREFIX = "demo_metric_";
const CUSTOMER_COUNT = 36;

// Deterministic pseudo-random generator: realistic-looking data, identical on every run.
function randomFor(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const reviewCopy = {
  5: [
    ["Rất hài lòng", "Chất liệu đẹp, đường may chỉn chu và phom mặc lên rất vừa vặn."],
    ["Đúng như mong đợi", "Màu sắc trang nhã, sản phẩm hoàn thiện tốt và đóng gói cẩn thận."],
    ["Sẽ tiếp tục ủng hộ", "Thiết kế tinh tế, dễ phối đồ và chất lượng tương xứng với mức giá."],
  ],
  4: [
    ["Sản phẩm tốt", "Chất liệu và phom dáng đều ổn. Kích cỡ khá sát với bảng hướng dẫn."],
    ["Khá hài lòng", "Màu thực tế đẹp, mặc thoải mái. Thời gian giao hàng có thể nhanh hơn một chút."],
  ],
  3: [
    ["Ở mức ổn", "Sản phẩm đúng mô tả nhưng phom dáng chưa thật sự phù hợp với mình."],
    ["Cần cân nhắc kích cỡ", "Chất liệu ổn, nên xem kỹ bảng kích cỡ trước khi đặt hàng."],
  ],
  2: [["Chưa phù hợp", "Thiết kế đẹp nhưng kích cỡ và cảm giác khi mặc chưa phù hợp với mong đợi của mình."]],
};

function ratingFor(value) {
  if (value < 0.55) return 5;
  if (value < 0.86) return 4;
  if (value < 0.97) return 3;
  return 2;
}

await connectDB();
const pool = getPool();
const transaction = new sql.Transaction(pool);

try {
  await transaction.begin();
  // Replace only data created by this script so reruns stay clean and predictable.
  await transaction.request().input("prefix", sql.NVarChar, `${DEMO_PREFIX}%`).query(`
    DELETE FROM ProductReviews WHERE user_id LIKE @prefix;
    DELETE FROM ProductFavoriteEvents WHERE user_id LIKE @prefix;
    DELETE FROM ProductFavorites WHERE user_id LIKE @prefix;
    DELETE FROM Payments WHERE order_id LIKE 'DEMO-ENG-%';
    DELETE FROM OrderItems WHERE order_id LIKE 'DEMO-ENG-%';
    DELETE FROM Orders WHERE id LIKE 'DEMO-ENG-%';
    DELETE FROM Users WHERE id LIKE @prefix;
  `);

  const products = (await transaction.request().query(`
    SELECT id, product_code, name, price, images_json
    FROM Products
    WHERE is_active = 1
    ORDER BY id
  `)).recordset;
  const variants = (await transaction.request().query(`
    SELECT id, product_id, sku, color_name, size_name, price,
           low_stock_threshold, max_stock_threshold
    FROM ProductVariants
    WHERE is_active = 1
    ORDER BY product_id, id
  `)).recordset;

  if (!products.length || !variants.length) throw new Error("Không có sản phẩm hoặc biến thể đang hoạt động để tạo dữ liệu mẫu.");

  const random = randomFor(20261104);
  const variantsByProduct = new Map();
  for (const variant of variants) {
    const list = variantsByProduct.get(variant.product_id) || [];
    list.push(variant);
    variantsByProduct.set(variant.product_id, list);
  }

  // Give each product one unambiguous operational state. Distribution targets:
  // about 58% stable, 20% overstock, 14% low stock and 8% out of stock.
  for (const product of products) {
    const productVariants = variantsByProduct.get(product.id) || [];
    const roll = random();
    const regime = roll < 0.08 ? "out" : roll < 0.22 ? "low" : roll < 0.42 ? "over" : "stable";
    const alertVariantIndex = Math.floor(random() * Math.max(1, productVariants.length));

    for (let index = 0; index < productVariants.length; index += 1) {
      const variant = productVariants[index];
      const min = Number(variant.low_stock_threshold || 3);
      const max = Math.max(min + 2, Number(variant.max_stock_threshold || 20));
      let stock = min + 1 + Math.floor(random() * Math.max(1, max - min - 1));
      if (index === alertVariantIndex && regime === "out") stock = 0;
      else if (index === alertVariantIndex && regime === "low") stock = 1 + Math.floor(random() * Math.max(1, min));
      else if (index === alertVariantIndex && regime === "over") stock = max + Math.floor(random() * 7);

      await transaction.request()
        .input("id", sql.NVarChar, variant.id)
        .input("stock", sql.Int, stock)
        .query("UPDATE ProductVariants SET stock_quantity=@stock, updated_at=GETDATE() WHERE id=@id");
    }
  }

  await transaction.request().query(`
    UPDATE p
    SET stock = totals.total_stock, updated_at = GETDATE()
    FROM Products p
    CROSS APPLY (
      SELECT COALESCE(SUM(v.stock_quantity), 0) total_stock
      FROM ProductVariants v
      WHERE v.product_id=p.id AND v.is_active=1
    ) totals
    WHERE p.is_active=1;
  `);

  const passwordHash = bcrypt.hashSync("demo123", 8);
  const customers = [];
  for (let index = 1; index <= CUSTOMER_COUNT; index += 1) {
    const id = `${DEMO_PREFIX}${String(index).padStart(2, "0")}`;
    const email = `khachhang.demo${String(index).padStart(2, "0")}@maisonrue.local`;
    const name = `Khách hàng mẫu ${String(index).padStart(2, "0")}`;
    customers.push({ id, email, name, index });
    await transaction.request()
      .input("id", sql.NVarChar, id)
      .input("name", sql.NVarChar, name)
      .input("email", sql.NVarChar, email)
      .input("hash", sql.NVarChar, passwordHash)
      .query(`
        MERGE Users AS target
        USING (SELECT @id id) AS source ON target.id=source.id
        WHEN MATCHED THEN UPDATE SET name=@name,email=@email,is_active=1,updated_at=GETDATE()
        WHEN NOT MATCHED THEN INSERT(id,name,email,password_hash,role,phone,is_active)
          VALUES(@id,@name,@email,@hash,'customer','0900000000',1);
      `);
  }

  let favoriteCount = 0;
  let reviewCount = 0;
  for (let productIndex = 0; productIndex < products.length; productIndex += 1) {
    const product = products[productIndex];
    const popularity = 0.15 + random() * 0.58;
    const targetFavorites = Math.max(4, Math.min(CUSTOMER_COUNT - 2, Math.round(CUSTOMER_COUNT * popularity)));
    const customerOffset = Math.floor(random() * CUSTOMER_COUNT);

    for (let index = 0; index < targetFavorites; index += 1) {
      const customer = customers[(customerOffset + index * 7) % CUSTOMER_COUNT];
      await transaction.request()
        .input("user", sql.NVarChar, customer.id)
        .input("product", sql.Int, product.id)
        .query(`
          MERGE ProductFavorites AS target
          USING (SELECT @user user_id,@product product_id) source
          ON target.user_id=source.user_id AND target.product_id=source.product_id
          WHEN MATCHED THEN UPDATE SET is_active=1,updated_at=GETDATE()
          WHEN NOT MATCHED THEN INSERT(user_id,product_id,is_active) VALUES(@user,@product,1);
          IF NOT EXISTS (
            SELECT 1 FROM ProductFavoriteEvents
            WHERE user_id=@user AND product_id=@product AND event_type='added'
          ) INSERT INTO ProductFavoriteEvents(user_id,product_id,event_type,created_at)
            VALUES(@user,@product,'added',DATEADD(day,-ABS(CHECKSUM(@user,@product))%30,GETDATE()));
        `);
      favoriteCount += 1;
    }

    // Reviews should remain scarce in the coursework dataset: only a selection
    // of products receives one or two verified reviews.
    const targetReviews = productIndex % 8 === 0 ? 1 + Math.floor(random() * 2) : 0;
    const productVariants = variantsByProduct.get(product.id) || [];
    for (let index = 0; index < targetReviews; index += 1) {
      const customer = customers[(customerOffset + index * 5 + 3) % CUSTOMER_COUNT];
      // One delivered order per demo customer can contain several reviewed products.
      // This preserves verified-purchase integrity without flooding operational order lists.
      const orderId = `DEMO-ENG-${customer.index}`;
      const variant = productVariants[index % productVariants.length];
      const price = Number(variant?.price || product.price);
      const imageUrl = (() => { try { return JSON.parse(product.images_json || "[]")[0] || null; } catch { return null; } })();
      const daysAgo = 3 + Math.floor(random() * 150);

      await transaction.request()
        .input("id", sql.NVarChar, orderId)
        .input("customer", sql.NVarChar, customer.id)
        .input("name", sql.NVarChar, customer.name)
        .input("email", sql.NVarChar, customer.email)
        .input("price", sql.Decimal(18, 0), price)
        .input("days", sql.Int, daysAgo)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM Orders WHERE id=@id)
          INSERT INTO Orders(id,customer_id,customer_name,customer_email,customer_phone,shipping_address,
            shipping_fee,total_amount,order_status,stock_deducted,notes,created_at,updated_at,
            original_subtotal,shipping_fee_original)
          VALUES(@id,@customer,@name,@email,'0900000000',N'Địa chỉ dữ liệu mẫu',0,0,'delivered',0,
            N'[DEMO_ENGAGEMENT] Đơn mẫu phục vụ thống kê đánh giá',DATEADD(day,-@days,GETDATE()),DATEADD(day,-@days+2,GETDATE()),0,0);
        `);

      const itemResult = await transaction.request()
        .input("order", sql.NVarChar, orderId)
        .input("product", sql.Int, product.id)
        .input("name", sql.NVarChar, product.name)
        .input("color", sql.NVarChar, variant?.color_name || "Mặc định")
        .input("size", sql.NVarChar, variant?.size_name || "ONE SIZE")
        .input("variant", sql.NVarChar, variant?.id || null)
        .input("sku", sql.NVarChar, variant?.sku || null)
        .input("price", sql.Decimal(18, 0), price)
        .input("image", sql.NVarChar, imageUrl)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM OrderItems WHERE order_id=@order AND product_id=@product)
          INSERT INTO OrderItems(order_id,product_id,product_name,selected_color,selected_size,variant_id,variant_sku,
            quantity,unit_price,total_price,image_url,original_unit_price,final_line_total)
          VALUES(@order,@product,@name,@color,@size,@variant,@sku,1,@price,@price,@image,@price,@price);
          SELECT TOP 1 id FROM OrderItems WHERE order_id=@order AND product_id=@product ORDER BY id;
        `);
      const itemId = itemResult.recordset[0].id;
      const rating = ratingFor(random());
      const copies = reviewCopy[rating];
      const [title, content] = copies[Math.floor(random() * copies.length)];

      await transaction.request()
        .input("product", sql.Int, product.id)
        .input("user", sql.NVarChar, customer.id)
        .input("order", sql.NVarChar, orderId)
        .input("item", sql.Int, itemId)
        .input("rating", sql.TinyInt, rating)
        .input("title", sql.NVarChar, title)
        .input("content", sql.NVarChar, content)
        .input("color", sql.NVarChar, variant?.color_name || "Mặc định")
        .input("size", sql.NVarChar, variant?.size_name || "ONE SIZE")
        .input("days", sql.Int, daysAgo - 2)
        .query(`
          MERGE ProductReviews AS target
          USING (SELECT @user user_id,@product product_id) source
          ON target.user_id=source.user_id AND target.product_id=source.product_id
          WHEN MATCHED THEN UPDATE SET rating=@rating,title=@title,content=@content,status='published',
            selected_color=@color,selected_size=@size,updated_at=GETDATE()
          WHEN NOT MATCHED THEN INSERT(product_id,user_id,order_id,order_item_id,rating,title,content,
            selected_color,selected_size,is_verified_purchase,status,created_at,updated_at)
          VALUES(@product,@user,@order,@item,@rating,@title,@content,@color,@size,1,'published',
            DATEADD(day,-@days,GETDATE()),DATEADD(day,-@days,GETDATE()));
        `);
      reviewCount += 1;
    }
  }

  await transaction.request().query(`
    UPDATE o
    SET total_amount=totals.amount,
        original_subtotal=totals.amount,
        updated_at=GETDATE()
    FROM Orders o
    CROSS APPLY (
      SELECT COALESCE(SUM(oi.total_price),0) amount
      FROM OrderItems oi WHERE oi.order_id=o.id
    ) totals
    WHERE o.id LIKE 'DEMO-ENG-%';

    INSERT INTO Payments(order_id,payment_method,amount,payment_status,created_at,updated_at)
    SELECT o.id,'cod',o.total_amount,'unpaid',o.created_at,GETDATE()
    FROM Orders o
    WHERE o.id LIKE 'DEMO-ENG-%'
      AND NOT EXISTS (SELECT 1 FROM Payments p WHERE p.order_id=o.id);
  `);

  await transaction.commit();
  console.log(`Đã cập nhật ${variants.length} biến thể tồn kho cho ${products.length} sản phẩm.`);
  console.log(`Đã tạo ${favoriteCount} lượt yêu thích đang hoạt động.`);
  console.log(`Đã tạo ${reviewCount} đánh giá mua hàng đã xác thực.`);
  console.log(`Đã dùng ${CUSTOMER_COUNT} tài khoản khách hàng mẫu; có thể chạy lại an toàn.`);
} catch (error) {
  if (transaction._aborted !== true) await transaction.rollback();
  console.error("Không thể tạo dữ liệu thống kê mẫu:", error);
  process.exitCode = 1;
} finally {
  await pool.close();
}
