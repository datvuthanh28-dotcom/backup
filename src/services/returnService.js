import emailjs from "@emailjs/browser";

const STORAGE_KEY = "maison_rue_return_requests";
export const RETURN_UPDATE_EVENT = "maison_return_requests_updated";

const INITIAL_DEMO_RETURNS = [
  {
    id: "RET-784201",
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    customerEmail: "customer@gmail.com",
    customerName: "Vũ Thành Đạt",
    item: "Merino Wool Knitted Polo (MR-106 - Beige / M)",
    reason: "Không vừa size",
    detailNote: "Áo mặc bị chật phần vai và ngực, mong muốn đổi sang size L cùng màu.",
    proofImageBase64: null,
    status: "PENDING",
    adminNote: "",
    staffNote: "Kho còn 3 chiếc size L màu Beige, sẵn sàng điều phối đổi hàng.",
    updatedAt: new Date(Date.now() - 3600000 * 3).toISOString(),
  },
  {
    id: "RET-652194",
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    customerEmail: "customer.vip@gmail.com",
    customerName: "Lê Hoàng Yến",
    item: "Suede Penny Loafers (MR-127 - 41)",
    reason: "Sản phẩm bị lỗi / hư hỏng",
    detailNote: "Đế giày có vết trầy xước nhẹ ở phần gót phải khi mở hộp kiện hàng.",
    proofImageBase64: null,
    status: "APPROVED",
    adminNote: "Đã chấp thuận hoàn tiền 100%. Đã ủy quyền bưu tá thu hồi hàng tại địa chỉ khách.",
    staffNote: "Đã liên hệ khách và xác nhận thông tin đơn hàng trùng khớp.",
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

/**
 * Lấy danh sách tất cả các yêu cầu đổi trả / hoàn tiền từ LocalStorage
 */
export function getReturnRequests() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_DEMO_RETURNS));
      return INITIAL_DEMO_RETURNS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("[ReturnService] Lỗi đọc dữ liệu:", err);
    return [];
  }
}

/**
 * Lưu danh sách yêu cầu vào LocalStorage và phát sự kiện đồng bộ
 */
export function saveReturnRequests(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(RETURN_UPDATE_EVENT, { detail: list }));
  } catch (err) {
    console.error("[ReturnService] Lỗi lưu dữ liệu:", err);
  }
}

/**
 * Tạo mới một yêu cầu đổi trả / hoàn tiền (từ Chatbox)
 */
export function createReturnRequest({
  customerEmail,
  customerName = "Quý khách",
  item,
  reason,
  detailNote = "",
  proofImageBase64 = null,
}) {
  const list = getReturnRequests();
  const newReq = {
    id: `RET-${Date.now().toString().slice(-6)}`,
    createdAt: new Date().toISOString(),
    customerEmail: customerEmail.trim().toLowerCase(),
    customerName: customerName || "Quý khách",
    item: item.trim(),
    reason: reason.trim(),
    detailNote: (detailNote || "").trim(),
    proofImageBase64: proofImageBase64 || null,
    status: "PENDING",
    adminNote: "",
    staffNote: "",
    updatedAt: new Date().toISOString(),
  };

  const updatedList = [newReq, ...list];
  saveReturnRequests(updatedList);
  return newReq;
}

/**
 * Cập nhật thông tin yêu cầu đổi trả theo ID
 */
export function updateReturnRequest(id, fields = {}) {
  const list = getReturnRequests();
  const idx = list.findIndex((r) => r.id === id);
  if (idx === -1) {
    throw new Error(`Không tìm thấy yêu cầu hoàn trả #${id}`);
  }

  const updatedItem = {
    ...list[idx],
    ...fields,
    updatedAt: new Date().toISOString(),
  };

  list[idx] = updatedItem;
  saveReturnRequests(list);
  return updatedItem;
}

/**
 * Gửi email thông báo xét duyệt hoàn tiền tới khách hàng qua EmailJS
 */
export async function sendReturnApprovalEmail(req) {
  const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID || "service_zkrrxcm";
  const templateId = import.meta.env.VITE_EMAILJS_RETURN_TEMPLATE_ID || "template_o58jllw";
  const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || "ZjQM0mkSjz2NACdA9";

  if (!serviceId || !templateId || !publicKey) {
    console.warn("[EmailJS] Chưa cấu hình đầy đủ EmailJS. Bỏ qua gửi email.");
    return { success: false, reason: "missing_email_configuration" };
  }

  const customerEmail = req.customerEmail || req.customer_email || "";
  const customerName = req.customerName || req.customer_name || "Quý khách";
  const itemDesc = req.item || `${req.product_name || "Sản phẩm"} (${req.selected_color || ""} / ${req.selected_size || ""})`.replace("(/)", "").trim();
  const reasonText = req.reason || req.reason_code || "Yêu cầu hoàn trả";
  const detailNote = req.detailNote || req.reason_detail || "Không có";
  const adminNote = req.adminNote || req.note || "Yêu cầu đã được Ban Quản Trị Maison Rue phê duyệt hoàn tiền.";
  const refundRef = req.refundReference || req.refund_reference || "";

  const subject = `[Maison Rue] Thông báo: Yêu cầu hoàn tiền #${req.id} đã được DUYỆT`;

  // HTML Template sang trọng gửi qua {{{message}}} trong EmailJS
  const messageHtml = `
<div style="background-color: #f7f5f2; padding: 25px 15px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #2c2523; line-height: 1.6;">
  <table role="presentation" style="max-width: 600px; width: 100%; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e8e2d8; box-shadow: 0 4px 15px rgba(0,0,0,0.03);" cellpadding="0" cellspacing="0">
    <tr>
      <td style="background-color: #1a1615; padding: 24px 20px; text-align: center;">
        <h1 style="margin: 0; color: #d4af37; font-size: 22px; letter-spacing: 4px; text-transform: uppercase; font-weight: 400;">MAISON RUE</h1>
        <p style="margin: 5px 0 0; color: #a89f91; font-size: 11px; letter-spacing: 2px; text-transform: uppercase;">Dịch Vụ Hậu Mãi & Chăm Sóc Khách Hàng</p>
      </td>
    </tr>
    <tr>
      <td style="background-color: #edf7ee; padding: 14px 25px; border-bottom: 2px solid #2e7d32; text-align: center;">
        <span style="font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: #2e7d32; font-weight: 700;">KẾT QUẢ XÉT DUYỆT HOÀN TIỀN</span>
        <div style="font-size: 18px; font-weight: bold; color: #1b5e20; margin-top: 4px;">ĐÃ ĐƯỢC CHẤP THUẬN (APPROVED)</div>
      </td>
    </tr>
    <tr>
      <td style="padding: 28px 30px;">
        <p style="font-size: 15px; margin: 0 0 15px;">Kính gửi <strong>${customerName}</strong>,</p>
        <p style="font-size: 14px; color: #554a44; margin: 0 0 20px; line-height: 1.6;">
          Ban Quản Trị Maison Rue xin thông báo: Yêu cầu hoàn tiền cho đơn hàng của quý khách đã được thẩm định và chính thức <strong>CHẤP THUẬN</strong>.
        </p>

        <table style="width: 100%; background-color: #faf8f5; border: 1px solid #eee7de; border-radius: 6px; padding: 16px 18px; margin-bottom: 20px;" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding: 6px 0; font-size: 13px; color: #786c64; width: 40%;">Mã yêu cầu:</td>
            <td style="padding: 6px 0; font-size: 14px; font-weight: bold; text-align: right; color: #1a1615;">#${req.id}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-size: 13px; color: #786c64;">Sản phẩm:</td>
            <td style="padding: 6px 0; font-size: 13px; font-weight: 600; text-align: right; color: #2c2523;">${itemDesc}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-size: 13px; color: #786c64;">Lý do:</td>
            <td style="padding: 6px 0; font-size: 13px; text-align: right; color: #2c2523;">${reasonText}</td>
          </tr>
          ${refundRef ? `
          <tr>
            <td style="padding: 6px 0; font-size: 13px; color: #786c64;">Mã đối soát hoàn tiền:</td>
            <td style="padding: 6px 0; font-size: 13px; font-weight: 600; text-align: right; color: #1b5e20;">${refundRef}</td>
          </tr>` : ""}
          <tr>
            <td style="padding: 6px 0; font-size: 13px; color: #786c64; vertical-align: top;">Ghi chú của quý khách:</td>
            <td style="padding: 6px 0; font-size: 13px; text-align: right; color: #554a44;">${detailNote}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0 0; font-size: 13px; color: #8a5a36; vertical-align: top; font-weight: bold;">Ghi chú từ Maison Rue:</td>
            <td style="padding: 8px 0 0; font-size: 13px; text-align: right; color: #8a5a36; font-weight: 600;">
              ${adminNote}
            </td>
          </tr>
        </table>

        ${
          req.proofImageBase64
            ? `<div style="margin-bottom: 20px; padding: 12px; background: #faf8f5; border-radius: 6px; border: 1px solid #eee7de;">
                 <p style="margin: 0 0 8px; font-size: 12px; font-weight: bold; color: #786c64; text-transform: uppercase;">Ảnh minh chứng đã tiếp nhận:</p>
                 <img src="${req.proofImageBase64}" alt="Ảnh minh chứng" style="max-width: 200px; max-height: 150px; border-radius: 6px; border: 1px solid #ddd; display: block;" />
               </div>`
            : ""
        }

        <div style="background-color: #f7f3ed; border-left: 3px solid #b68a3b; padding: 12px 16px; font-size: 12.5px; color: #6b5c50; line-height: 1.6; margin-bottom: 20px;">
          <strong>Quy trình hoàn tất tài chính:</strong><br/>
          1. Giao dịch hoàn tiền đã được xử lý trên hệ thống đối soát của Maison Rue.<br/>
          2. Tiền sẽ được hoàn trả về tài khoản hoặc phương thức thanh toán ban đầu của quý khách trong vòng 3–5 ngày làm việc theo quy định ngân hàng.<br/>
          3. Nếu cần hỗ trợ thêm, quý khách chỉ cần trả lời trực tiếp email này.
        </div>

        <p style="font-size: 13px; color: #666; margin: 0;">Maison Rue chân thành cảm ơn sự thông cảm và đồng hành của quý khách.</p>
      </td>
    </tr>
    <tr>
      <td style="background-color: #faf8f5; border-top: 1px solid #ece5dc; padding: 18px 20px; text-align: center; font-size: 11.5px; color: #8e8073;">
        <p style="margin: 0 0 4px;">Cảm ơn quý khách đã tin tưởng và đồng hành cùng <strong>Maison Rue</strong>.</p>
        <p style="margin: 0;">Trân trọng, <strong>Ban Quản Trị Maison Rue</strong></p>
      </td>
    </tr>
  </table>
</div>
  `.trim();

  const templateParams = {
    // Thông tin người nhận & tiêu đề
    to_email: customerEmail,
    email: customerEmail,
    name: customerName,
    customer_name: customerName,
    subject: subject,
    title: subject, // Đảm bảo khớp cả khi template dùng {{title}}

    // Reuse the configured order-status template fields
    order_id: req.order_id || req.id,
    request_id: req.id,
    order_status: "ĐÃ ĐƯỢC DUYỆT HOÀN TIỀN (APPROVED)",
    message_intro: "Ban Quản Trị Maison Rue đã xem xét và chính thức CHẤP THUẬN yêu cầu hoàn tiền của quý khách.",
    order_date: new Date().toLocaleString("vi-VN", { hour12: false }),
    payment_method: "Hoàn trả về phương thức thanh toán ban đầu",
    shipping_address: "Đối soát và hoàn tiền qua hệ thống thanh toán",
    order_items: `• Sản phẩm: ${itemDesc}\n• Lý do: ${reasonText}\n• Chi tiết: ${detailNote}`,
    total_amount: req.amount ? `${Number(req.amount).toLocaleString("vi-VN")}đ` : "XÁC NHẬN HOÀN TIỀN",
    note: adminNote,

    // Các biến chi tiết nếu dùng template riêng
    item: itemDesc,
    reason: reasonText,
    detail_note: detailNote,
    admin_note: adminNote,
    refund_reference: refundRef,
    proof_image: req.proofImageBase64 || "",
    status_text: "APPROVED",
    message: messageHtml,
  };

  try {
    const res = await emailjs.send(serviceId, templateId, templateParams, { publicKey });
    console.log("[EmailJS] Đã gửi email phê duyệt đổi trả thành công:", res);
    return { success: true, res };
  } catch (err) {
    console.error("[EmailJS] Lỗi gửi email phê duyệt đổi trả:", err);
    return { success: false, error: err };
  }
}

/**
 * Admin phê duyệt yêu cầu đổi trả và tự động gửi email thông báo
 */
export async function approveReturnRequest({ id, adminNote = "" }) {
  const updatedItem = updateReturnRequest(id, {
    status: "APPROVED",
    adminNote: adminNote.trim(),
  });

  const emailResult = await sendReturnApprovalEmail(updatedItem);
  return { success: true, request: updatedItem, emailResult };
}

/**
 * Admin từ chối yêu cầu đổi trả
 */
export function rejectReturnRequest({ id, adminNote = "" }) {
  const updatedItem = updateReturnRequest(id, {
    status: "REJECTED",
    adminNote: adminNote.trim(),
  });

  return { success: true, request: updatedItem };
}

