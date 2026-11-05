import bcrypt from "bcryptjs";
import sql from "mssql";
import { connectDB, getPool } from "../config/db.js";

const ORDER_PREFIX = "SIM-BI-";
const USER_PREFIX = "sim_bi_";
const DAYS = 90;
const CUSTOMER_COUNT = 32;

function rng(seed) {
  let state = seed >>> 0;
  return () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const random = rng(20261105);
const pick = (list) => list[Math.floor(random() * list.length)];
const round10k = (value) => Math.round(value / 10000) * 10000;

await connectDB();
const pool = getPool();
const tx = new sql.Transaction(pool);

try {
  await tx.begin();
  await tx.request().query(`
    IF COL_LENGTH('Orders','data_origin') IS NULL
      ALTER TABLE Orders ADD data_origin NVARCHAR(20) NOT NULL CONSTRAINT DF_Orders_DataOrigin DEFAULT 'actual';
    IF COL_LENGTH('Orders','scenario_tag') IS NULL ALTER TABLE Orders ADD scenario_tag NVARCHAR(80) NULL;
  `);

  // Only replace this script's records. Operational and manually created orders are untouched.
  await tx.request().input("orderPrefix", sql.NVarChar, `${ORDER_PREFIX}%`).input("userPrefix", sql.NVarChar, `${USER_PREFIX}%`).query(`
    DELETE FROM PromotionUsages WHERE order_id LIKE @orderPrefix;
    DELETE FROM ProductReviews WHERE order_id LIKE @orderPrefix;
    DELETE FROM Payments WHERE order_id LIKE @orderPrefix;
    DELETE FROM OrderStatusHistory WHERE order_id LIKE @orderPrefix;
    DELETE FROM OrderItems WHERE order_id LIKE @orderPrefix;
    DELETE FROM Orders WHERE id LIKE @orderPrefix;
    DELETE FROM Users WHERE id LIKE @userPrefix;
  `);

  const variants = (await tx.request().query(`
    SELECT v.id,v.product_id,v.sku,v.color_name,v.size_name,v.price,v.cost_price,
           p.name,p.gender AS audience,p.category,CAST(NULL AS NVARCHAR(100)) AS subcategory,p.images_json
    FROM ProductVariants v JOIN Products p ON p.id=v.product_id
    WHERE v.is_active=1 AND p.is_active=1 AND v.cost_price IS NOT NULL
    ORDER BY p.id,v.id
  `)).recordset;
  if (!variants.length) throw new Error("Không có SKU hợp lệ để sinh đơn hàng phân tích.");

  const password = bcrypt.hashSync("analytics123", 8);
  const districts = ["Quận 1","Quận 3","Quận 7","Bình Thạnh","Phú Nhuận","Thủ Đức"];
  const customers = [];
  for (let i=1;i<=CUSTOMER_COUNT;i+=1) {
    const id=`${USER_PREFIX}${String(i).padStart(2,"0")}`;
    const customer={id,name:`Khách hàng phân tích ${String(i).padStart(2,"0")}`,email:`analytics${String(i).padStart(2,"0")}@maisonrue.local`,phone:`09${String(10000000+i).slice(-8)}`};
    customers.push(customer);
    await tx.request().input("id",sql.NVarChar,id).input("name",sql.NVarChar,customer.name).input("email",sql.NVarChar,customer.email).input("phone",sql.NVarChar,customer.phone).input("hash",sql.NVarChar,password).query(`
      INSERT INTO Users(id,name,email,password_hash,role,phone,is_active,created_at,updated_at)
      VALUES(@id,@name,@email,@hash,'customer',@phone,1,DATEADD(day,-210,GETDATE()),GETDATE())
    `);
  }

  // Weighted catalogue: a small bestseller group, a healthy middle, and a long tail.
  const weighted=[];
  variants.forEach((variant,index)=>{
    const weight=index<Math.ceil(variants.length*0.12)?6:index<Math.ceil(variants.length*0.45)?3:1;
    for(let n=0;n<weight;n+=1) weighted.push(variant);
  });

  let orderCount=0, deliveredCount=0, cancelledCount=0, discountedCount=0, itemCount=0;
  for (let dayOffset=DAYS-1;dayOffset>=0;dayOffset-=1) {
    const date=new Date();
    date.setHours(10+Math.floor(random()*10),Math.floor(random()*60),0,0);
    date.setDate(date.getDate()-dayOffset);
    const weekday=date.getDay();
    const month=date.getMonth()+1;
    const weekendFactor=[0,6].includes(weekday)?1.35:1;
    const seasonalFactor=[10,11,12].includes(month)?1.3:month===2?1.18:1;
    const dailyOrders=Math.max(0,Math.round((0.75+random()*1.8)*weekendFactor*seasonalFactor));

    for(let daily=0;daily<dailyOrders;daily+=1) {
      orderCount+=1;
      const id=`${ORDER_PREFIX}${String(orderCount).padStart(5,"0")}`;
      // 35% of customers drive about 65% of orders, representing repeat buyers.
      const customer=random()<0.65?customers[Math.floor(random()*11)]:pick(customers);
      const ageDays=dayOffset;
      const statusRoll=random();
      let status;
      if(ageDays<=3) status=statusRoll<0.12?"cancelled":statusRoll<0.35?"pending":statusRoll<0.58?"confirmed":statusRoll<0.78?"processing":"shipping";
      else status=statusRoll<0.085?"cancelled":"delivered";
      if(status==="delivered") deliveredCount+=1;
      if(status==="cancelled") cancelledCount+=1;

      const basketSize=random()<0.72?1:random()<0.92?2:3;
      const chosen=[];
      while(chosen.length<basketSize) {
        const variant=pick(weighted);
        if(!chosen.some((entry)=>entry.id===variant.id)) chosen.push(variant);
      }
      const discountRate=random()<0.17?0.10:random()<0.10?0.15:random()<0.18?0.05:0;
      if(discountRate>0) discountedCount+=1;
      const originalSubtotal=chosen.reduce((sum,v)=>sum+Number(v.price),0);
      const productDiscount=round10k(originalSubtotal*discountRate);
      const shippingOriginal=originalSubtotal>=3500000?0:40000;
      const shippingDiscount=discountRate>=0.15&&shippingOriginal?shippingOriginal:0;
      const shippingFee=shippingOriginal-shippingDiscount;
      const total=originalSubtotal-productDiscount+shippingFee;
      const created=new Date(date.getTime()+daily*37*60000);
      const delivered=status==="delivered"?new Date(created.getTime()+(2+Math.floor(random()*4))*86400000):null;
      const paymentMethod=random()<0.53?"cod":random()<0.62?"bank_transfer":"credit_card";
      const paid=status==="delivered";
      const verified=paid?new Date(delivered.getTime()-(paymentMethod==="cod"?0:Math.floor(random()*2)*86400000)):null;
      const recognized=paid?new Date(Math.max(delivered.getTime(),verified.getTime())):null;
      const paymentStatus=status==="cancelled"?"cancelled":paid?"paid":paymentMethod==="cod"?"unpaid":"pending_verification";

      await tx.request()
        .input("id",sql.NVarChar,id).input("customer",sql.NVarChar,customer.id).input("name",sql.NVarChar,customer.name)
        .input("email",sql.NVarChar,customer.email).input("phone",sql.NVarChar,customer.phone)
        .input("address",sql.NVarChar,`${18+orderCount%170} đường Maison, ${pick(districts)}, TP. Hồ Chí Minh`)
        .input("shipping",sql.Decimal(18,0),shippingFee).input("total",sql.Decimal(18,0),total)
        .input("status",sql.NVarChar,status).input("created",sql.DateTime2,created).input("delivered",sql.DateTime2,delivered)
        .input("recognized",sql.DateTime2,recognized).input("original",sql.Decimal(18,0),originalSubtotal)
        .input("discount",sql.Decimal(18,0),productDiscount).input("shippingOriginal",sql.Decimal(18,0),shippingOriginal)
        .input("shippingDiscount",sql.Decimal(18,0),shippingDiscount).input("promo",sql.NVarChar,discountRate?`SIM${Math.round(discountRate*100)}`:null)
        .query(`INSERT INTO Orders(id,customer_id,customer_name,customer_email,customer_phone,shipping_address,shipping_fee,total_amount,
          order_status,stock_deducted,notes,created_at,updated_at,original_subtotal,product_discount_total,code_discount_total,
          shipping_fee_original,shipping_discount_total,promotion_code,promotion_snapshot_json,delivered_at,recognized_at,data_origin,scenario_tag)
          VALUES(@id,@customer,@name,@email,@phone,@address,@shipping,@total,@status,0,
          N'[DỮ LIỆU MÔ PHỎNG] Phục vụ kiểm thử báo cáo và đề xuất khuyến mãi',@created,COALESCE(@recognized,@created),@original,@discount,0,
          @shippingOriginal,@shippingDiscount,@promo,CASE WHEN @promo IS NULL THEN NULL ELSE N'{"source":"analytics_seed"}' END,
          @delivered,@recognized,'simulated','analytics_baseline_90d')`);

      let allocated=0;
      for(let index=0;index<chosen.length;index+=1) {
        itemCount+=1;
        const variant=chosen[index];
        const lineOriginal=Number(variant.price);
        const lineDiscount=index===chosen.length-1?productDiscount-allocated:round10k(productDiscount*lineOriginal/originalSubtotal);
        allocated+=lineDiscount;
        const finalLine=lineOriginal-lineDiscount;
        let image=null; try { image=JSON.parse(variant.images_json||"[]")[0]||null; } catch { image=null; }
        await tx.request().input("order",sql.NVarChar,id).input("product",sql.Int,variant.product_id).input("name",sql.NVarChar,variant.name)
          .input("color",sql.NVarChar,variant.color_name).input("size",sql.NVarChar,variant.size_name).input("variant",sql.NVarChar,variant.id)
          .input("sku",sql.NVarChar,variant.sku).input("price",sql.Decimal(18,0),lineOriginal).input("discount",sql.Decimal(18,0),lineDiscount)
          .input("final",sql.Decimal(18,0),finalLine).input("cost",sql.Decimal(18,0),variant.cost_price).input("image",sql.NVarChar,image)
          .input("created",sql.DateTime2,created).query(`INSERT INTO OrderItems(order_id,product_id,product_name,selected_color,selected_size,
            variant_id,variant_sku,quantity,unit_price,total_price,image_url,created_at,original_unit_price,automatic_discount_total,
            order_discount_allocated,final_line_total,promotion_snapshot_json,unit_cost_snapshot)
            VALUES(@order,@product,@name,@color,@size,@variant,@sku,1,@price,@final,@image,@created,@price,@discount,0,@final,
            CASE WHEN @discount>0 THEN N'{"source":"analytics_seed"}' ELSE NULL END,@cost)`);
      }

      await tx.request().input("order",sql.NVarChar,id).input("method",sql.NVarChar,paymentMethod).input("amount",sql.Decimal(18,0),total)
        .input("status",sql.NVarChar,paymentStatus).input("verified",sql.DateTime2,verified).input("created",sql.DateTime2,created)
        .input("reference",sql.NVarChar,paid&&paymentMethod!=="cod"?`SIMTX${String(orderCount).padStart(7,"0")}`:null)
        .query(`INSERT INTO Payments(order_id,payment_method,amount,payment_status,verified_at,verified_by,transaction_reference,created_at,updated_at)
          VALUES(@order,@method,@amount,@status,@verified,CASE WHEN @verified IS NULL THEN NULL ELSE N'Hệ thống mô phỏng' END,@reference,@created,COALESCE(@verified,@created))`);

      await tx.request().input("order",sql.NVarChar,id).input("status",sql.NVarChar,status).input("created",sql.DateTime2,created)
        .query(`INSERT INTO OrderStatusHistory(order_id,previous_status,new_status,note,updated_by,created_at)
          VALUES(@order,NULL,'pending',N'Đơn mô phỏng được tạo','analytics_seed',@created);
          IF @status<>'pending' INSERT INTO OrderStatusHistory(order_id,previous_status,new_status,note,updated_by,created_at)
          VALUES(@order,'pending',@status,N'Chuyển trạng thái theo kịch bản dữ liệu mô phỏng','analytics_seed',DATEADD(hour,8,@created));`);
    }
  }

  // A deliberately small review sample, always tied to a delivered order item.
  // Existing reviews are respected through the user/product uniqueness check.
  await tx.request().input("prefix",sql.NVarChar,`${ORDER_PREFIX}%`).query(`
    ;WITH candidates AS (
      SELECT oi.id order_item_id,oi.order_id,oi.product_id,o.customer_id,
             oi.selected_color,oi.selected_size,o.recognized_at,
             ROW_NUMBER() OVER (PARTITION BY o.customer_id,oi.product_id ORDER BY o.recognized_at DESC) pair_rank
      FROM OrderItems oi JOIN Orders o ON o.id=oi.order_id
      WHERE o.id LIKE @prefix AND o.order_status='delivered' AND o.recognized_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM ProductReviews r WHERE r.user_id=o.customer_id AND r.product_id=oi.product_id)
    ), sample AS (
      SELECT *,ROW_NUMBER() OVER (ORDER BY CHECKSUM(order_id,order_item_id)) sample_rank
      FROM candidates WHERE pair_rank=1
    )
    INSERT INTO ProductReviews(product_id,user_id,order_id,order_item_id,rating,title,content,selected_color,selected_size,
      is_verified_purchase,status,created_at,updated_at)
    SELECT product_id,customer_id,order_id,order_item_id,
      CASE sample_rank%5 WHEN 0 THEN 3 WHEN 1 THEN 5 WHEN 2 THEN 4 WHEN 3 THEN 5 ELSE 4 END,
      CASE sample_rank%3 WHEN 0 THEN N'Đúng như mong đợi' WHEN 1 THEN N'Sản phẩm tốt' ELSE N'Khá hài lòng' END,
      CASE sample_rank%3 WHEN 0 THEN N'Chất liệu đẹp, phom dáng chỉn chu và sản phẩm đúng với mô tả.'
        WHEN 1 THEN N'Màu sắc trang nhã, kích cỡ phù hợp với bảng hướng dẫn.'
        ELSE N'Thiết kế tinh tế và dễ phối đồ, trải nghiệm giao nhận ổn định.' END,
      selected_color,selected_size,1,'published',DATEADD(day,1,recognized_at),DATEADD(day,1,recognized_at)
    FROM sample WHERE sample_rank<=12;
  `);

  await tx.commit();
  console.log(JSON.stringify({periodDays:DAYS,customers:CUSTOMER_COUNT,orders:orderCount,items:itemCount,delivered:deliveredCount,cancelled:cancelledCount,discountedOrders:discountedCount},null,2));
  console.log("Tất cả đơn bổ sung được đánh dấu data_origin='simulated' và không làm thay đổi tồn kho vận hành.");
} catch(error) {
  if(tx._aborted!==true) await tx.rollback();
  console.error("Không thể sinh dữ liệu đơn hàng phân tích:",error);
  process.exitCode=1;
} finally {
  await pool.close();
}

