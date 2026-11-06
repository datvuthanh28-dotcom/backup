import emailjs from "@emailjs/browser";

const STORAGE_KEY = "maison_rue_return_requests";
export const RETURN_UPDATE_EVENT = "maison_return_requests_updated";

const INITIAL_DEMO_RETURNS = [
  {
    id: "RET-784201",
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    customerEmail: "vudat9532@gmail.com",
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
  const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID || "service_az46k1f";
  const templateId = import.meta.env.VITE_EMAILJS_ORDER_TEMPLATE_ID || "template_20zssht";
  const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || "ZjQM0mkSjz2NACdA9";

  if (!publicKey) {
    console.warn("[EmailJS] Chưa cấu hình VITE_EMAILJS_PUBLIC_KEY. Bỏ qua gửi email.");
    return { success: false, reason: "missing_public_key" };
  }

  const subject = `[Maison Rue] Thông báo: Yêu cầu đổi trả #${req.id} đã được DUYỆT`;

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
        <span style="font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: #2e7d32; font-weight: 700;">KẾT QUẢ XÉT DUYỆT HOÀN TRẢ</span>
        <div style="font-size: 18px; font-weight: bold; color: #1b5e20; margin-top: 4px;">ĐÃ ĐƯỢC CHẤP THUẬN (APPROVED)</div>
      </td>
    </tr>
    <tr>
      <td style="padding: 28px 30px;">
        <p style="font-size: 15px; margin: 0 0 15px;">Kính gửi <strong>${req.customerName || "Quý khách"}</strong>,</p>
        <p style="font-size: 14px; color: #554a44; margin: 0 0 20px; line-height: 1.6;">
          Ban Quản Trị Maison Rue đã xem xét hồ sơ và chính thức <strong>CHẤP THUẬN</strong> yêu cầu đổi/trả sản phẩm của quý khách.
        </p>

        <table style="width: 100%; background-color: #faf8f5; border: 1px solid #eee7de; border-radius: 6px; padding: 16px 18px; margin-bottom: 20px;" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding: 6px 0; font-size: 13px; color: #786c64; width: 40%;">Mã yêu cầu:</td>
            <td style="padding: 6px 0; font-size: 14px; font-weight: bold; text-align: right; color: #1a1615;">#${req.id}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-size: 13px; color: #786c64;">Sản phẩm / Đơn hàng:</td>
            <td style="padding: 6px 0; font-size: 13px; font-weight: 600; text-align: right; color: #2c2523;">${req.item}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-size: 13px; color: #786c64;">Lý do hoàn trả:</td>
            <td style="padding: 6px 0; font-size: 13px; text-align: right; color: #2c2523;">${req.reason}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-size: 13px; color: #786c64; vertical-align: top;">Ghi chú của quý khách:</td>
            <td style="padding: 6px 0; font-size: 13px; text-align: right; color: #554a44;">${req.detailNote || "Không có"}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0 0; font-size: 13px; color: #8a5a36; vertical-align: top; font-weight: bold;">Phản hồi từ Admin:</td>
            <td style="padding: 8px 0 0; font-size: 13px; text-align: right; color: #8a5a36; font-weight: 600;">
              ${req.adminNote || "Yêu cầu đã được phê duyệt. Đội ngũ Maison Rue sẽ liên hệ thu hồi hàng trong 1-2 ngày tới."}
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
          <strong>Quy trình tiếp theo:</strong><br/>
          1. Nhân viên vận chuyển của Maison Rue sẽ liên hệ quý khách trước khi đến tiếp nhận sản phẩm.<br/>
          2. Quý khách vui lòng đóng gói sản phẩm nguyên vẹn (kèm bao bì, phụ kiện nếu có).<br/>
          3. Tiền hoàn sẽ được giải ngân về phương thức thanh toán gốc của quý khách trong vòng 3–5 ngày làm việc.
        </div>

        <p style="font-size: 13px; color: #666; margin: 0;">Mọi thắc mắc cần hỗ trợ khẩn cấp, xin vui lòng phản hồi trực tiếp tới email này hoặc liên hệ hotline chăm sóc khách hàng.</p>
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
    to_email: req.customerEmail,
    email: req.customerEmail,
    subject: subject,
    item: req.item,
    reason: req.reason,
    detail_note: req.detailNote || "Không có",
    admin_note: req.adminNote || "Yêu cầu đã được phê duyệt",
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
