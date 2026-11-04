import emailjs from "@emailjs/browser";

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID || "service_az46k1f";
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || "";
const ORDER_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_ORDER_TEMPLATE_ID || "template_20zssht";
const STOCK_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_STOCK_TEMPLATE_ID || "template_6xhxjdo";
const ALERT_EMAILS = import.meta.env.VITE_ALERT_EMAILS || "maisonruestaff2@gmail.com,vanhung29993@gmail.com";

function formatCurrency(amount) {
  if (typeof amount !== "number") amount = Number(amount) || 0;
  return amount.toLocaleString("vi-VN") + " VNĐ";
}

function formatPaymentMethod(method) {
  switch (method?.toLowerCase()) {
    case "vnpay":
      return "Cổng thanh toán điện tử VNPAY (Đã bảo mật)";
    case "bank_transfer":
      return "Chuyển khoản ngân hàng trực tiếp";
    case "cod":
    default:
      return "Thanh toán khi nhận hàng (COD)";
  }
}

function formatItemsList(items = []) {
  if (!Array.isArray(items) || items.length === 0) return "Chi tiết sản phẩm đang được cập nhật.";
  return items
    .map((item, idx) => {
      const name = item.name || item.product_name || "Sản phẩm";
      const variant = [item.selectedColor || item.color, item.selectedSize || item.size].filter(Boolean).join(" / ");
      const variantStr = variant ? ` (${variant})` : "";
      const qty = item.quantity || 1;
      const price = formatCurrency(item.price || item.unit_price || 0);
      return `${idx + 1}. ${name}${variantStr} - Số lượng: ${qty} - Đơn giá: ${price}`;
    })
    .join("\n");
}

/**
 * 1. Gửi email xác nhận khi khách đặt hàng thành công
 */
export async function sendOrderConfirmationEmail(order) {
  if (!PUBLIC_KEY) {
    console.warn("[EmailJS] Chưa có VITE_EMAILJS_PUBLIC_KEY trong .env. Bỏ qua gửi email.");
    return { success: false, reason: "missing_public_key" };
  }

  const recipientEmail = order.customer_email || order.email || "vudat9532@gmail.com";
  const templateParams = {
    to_email: recipientEmail,
    subject: "Xác nhận đặt hàng thành công",
    order_id: order.id,
    order_status: "ĐÃ TIẾP NHẬN (CHỜ XỬ LÝ)",
    customer_name: order.customer_name || order.name || "Quý khách",
    message_intro: "Cảm ơn quý khách đã tin tưởng và lựa chọn Maison Rue. Đơn hàng của quý khách đã được ghi nhận trên hệ thống và đội ngũ chăm sóc khách hàng sẽ xử lý trong thời gian sớm nhất.",
    order_date: new Date().toLocaleString("vi-VN", { hour12: false }),
    payment_method: formatPaymentMethod(order.payment_method || order.paymentMethod),
    shipping_address: order.shipping_address || order.address || "Nhận tại cửa hàng",
    order_items: formatItemsList(order.items),
    total_amount: formatCurrency(order.total_amount || order.totalPrice || 0),
    note: "Quý khách vui lòng kiểm tra kỹ thông tin và chuẩn bị sẵn số tiền thanh toán khi nhận hàng (đối với phương thức COD).",
  };

  try {
    const res = await emailjs.send(SERVICE_ID, ORDER_TEMPLATE_ID, templateParams, { publicKey: PUBLIC_KEY });
    console.log("[EmailJS] Đã gửi email xác nhận đặt hàng thành công:", res);
    return { success: true, res };
  } catch (err) {
    console.error("[EmailJS] Lỗi gửi email xác nhận đặt hàng:", err);
    return { success: false, error: err };
  }
}

/**
 * 2. Gửi email khi đơn được xác nhận, giao hàng hoặc hủy
 */
export async function sendOrderStatusEmail(order, newStatus, note = "") {
  if (!PUBLIC_KEY) {
    console.warn("[EmailJS] Chưa có VITE_EMAILJS_PUBLIC_KEY trong .env. Bỏ qua gửi email.");
    return { success: false, reason: "missing_public_key" };
  }

  const recipientEmail = order.customer_email || order.email || "vudat9532@gmail.com";
  let statusTitle = "Cập nhật đơn hàng";
  let statusBadge = newStatus?.toUpperCase() || "ĐANG XỬ LÝ";
  let messageIntro = `Đơn hàng của quý khách vừa được chuyển sang trạng thái: ${newStatus}.`;

  switch (newStatus?.toLowerCase()) {
    case "confirmed":
      statusTitle = "Đơn hàng đã được xác nhận";
      statusBadge = "ĐÃ XÁC NHẬN";
      messageIntro = "Maison Rue vui mừng thông báo đơn hàng của quý khách đã được xác nhận và đang được bộ phận kho vận chuẩn bị đóng gói cẩn thận.";
      break;
    case "processing":
      statusTitle = "Đơn hàng đang chuẩn bị đóng gói";
      statusBadge = "ĐANG ĐÓNG GÓI";
      messageIntro = "Bộ phận kho vận đang tiến hành kiểm tra chất lượng và đóng gói đơn hàng của quý khách theo tiêu chuẩn Maison Rue.";
      break;
    case "shipping":
      statusTitle = "Đơn hàng đang trên đường giao";
      statusBadge = "ĐANG VẬN CHUYỂN";
      messageIntro = "Đơn hàng của quý khách đã được bàn giao cho đối tác vận chuyển cao cấp. Quý khách vui lòng lưu ý điện thoại trong 1-2 ngày tới.";
      break;
    case "delivered":
      statusTitle = "Đơn hàng đã giao thành công";
      statusBadge = "GIAO THÀNH CÔNG";
      messageIntro = "Maison Rue trân trọng thông báo đơn hàng đã được giao tận tay quý khách. Kính chúc quý khách có những trải nghiệm tuyệt vời cùng các thiết kế cao cấp của chúng tôi.";
      break;
    case "cancelled":
      statusTitle = "Thông báo hủy đơn hàng";
      statusBadge = "ĐÃ HỦY ĐƠN";
      messageIntro = `Maison Rue xin thông báo đơn hàng #${order.id} đã được hủy trên hệ thống. ${note ? `Lý do: ${note}` : ""}`;
      break;
    default:
      break;
  }

  const templateParams = {
    to_email: recipientEmail,
    subject: statusTitle,
    order_id: order.id,
    order_status: statusBadge,
    customer_name: order.customer_name || order.name || "Quý khách",
    message_intro: messageIntro,
    order_date: new Date().toLocaleString("vi-VN", { hour12: false }),
    payment_method: formatPaymentMethod(order.payment_method || order.paymentMethod),
    shipping_address: order.shipping_address || order.address || "Nhận tại cửa hàng",
    order_items: formatItemsList(order.items),
    total_amount: formatCurrency(order.total_amount || order.totalPrice || 0),
    note: note ? `Ghi chú từ nhân viên: ${note}` : "Mọi thắc mắc cần hỗ trợ, xin vui lòng phản hồi lại email này hoặc liên hệ hotline chăm sóc khách hàng.",
  };

  try {
    const res = await emailjs.send(SERVICE_ID, ORDER_TEMPLATE_ID, templateParams, { publicKey: PUBLIC_KEY });
    console.log(`[EmailJS] Đã gửi email cập nhật trạng thái [${newStatus}] thành công:`, res);
    return { success: true, res };
  } catch (err) {
    console.error(`[EmailJS] Lỗi gửi email trạng thái [${newStatus}]:`, err);
    return { success: false, error: err };
  }
}

/**
 * 3. Gửi cảnh báo kho cho Admin/Staff khi SKU chạm mức tối thiểu
 */
export async function sendLowStockAlertEmail({
  productName,
  sku,
  variantInfo = "",
  currentStock = 0,
  minStock = 3,
  note = "",
}) {
  if (!PUBLIC_KEY) {
    console.warn("[EmailJS] Chưa có VITE_EMAILJS_PUBLIC_KEY trong .env. Bỏ qua gửi email.");
    return { success: false, reason: "missing_public_key" };
  }

  const recipients = ALERT_EMAILS.split(",").map((e) => e.trim()).filter(Boolean);
  const alertTime = new Date().toLocaleString("vi-VN", { hour12: false });
  const actionNote = note || "Vui lòng kiểm tra tồn kho vật lý tại kho và lên kế hoạch nhập hàng hoặc điều chuyển kho kịp thời để tránh gián đoạn kinh doanh.";

  const results = [];
  for (const to_email of recipients) {
    const templateParams = {
      to_email,
      product_name: productName || "Sản phẩm Maison Rue",
      sku_code: sku || "Chưa có mã SKU",
      variant_info: variantInfo || "Biến thể tiêu chuẩn",
      current_stock: currentStock,
      min_stock: minStock,
      alert_time: alertTime,
      note: actionNote,
    };

    try {
      const res = await emailjs.send(SERVICE_ID, STOCK_TEMPLATE_ID, templateParams, { publicKey: PUBLIC_KEY });
      console.log(`[EmailJS] Đã gửi cảnh báo tồn kho tới ${to_email}:`, res);
      results.push({ email: to_email, success: true, res });
    } catch (err) {
      console.error(`[EmailJS] Lỗi gửi cảnh báo tồn kho tới ${to_email}:`, err);
      results.push({ email: to_email, success: false, error: err });
    }
  }

  return { success: results.some((r) => r.success), results };
}
