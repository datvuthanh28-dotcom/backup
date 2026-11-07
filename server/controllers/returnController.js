import { db } from "../config/db.js";
import { evaluateReturnRequest } from "../services/returnPolicyService.js";

const id = () => `RET-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

export async function submitReturnRequest(req, res) {
  try {
    const { orderId, orderItemId, requestType, reasonCode, reasonDetail, quantity, exchangeSize, exchangeColor, conditionConfirmed } = req.body || {};
    const order = await db.getOrderById(String(orderId || ""));
    if (!order || order.customer_id !== req.user.id) return res.status(404).json({ success: false, error: "Order item not found." });

    // Delivered check (Section III): Only strictly delivered orders can enter the return flow
    if (order.order_status !== "delivered") {
      return res.status(400).json({
        success: false,
        error: "Chỉ đơn hàng đã giao thành công (delivered) mới có thể gửi hồ sơ đổi trả chính thức. Vui lòng liên hệ hỗ trợ nếu đơn hàng đang giao chưa được xác nhận.",
      });
    }

    const orderItem = order.items.find((item) => Number(item.id) === Number(orderItemId));
    if (!orderItem) return res.status(404).json({ success: false, error: "Order item not found." });

    // Duplicate check (Section III): Prevent multiple return requests for the same order item
    const existingRequest = await db.getReturnRequestForOrderItem({ customerId: req.user.id, orderItemId: orderItem.id });
    if (existingRequest) {
      return res.status(409).json({
        success: false,
        error: "Hồ sơ đổi/trả cho sản phẩm này đã tồn tại trong hệ thống. Vui lòng xem trạng thái xử lý hiện tại hoặc liên hệ bộ phận hỗ trợ khách hàng để được giải đáp.",
      });
    }

    if (!["refund", "exchange"].includes(requestType)) return res.status(400).json({ success: false, error: "Choose a return/refund or exchange request." });
    if (requestType === "exchange") {
      const options = await db.getProductVariantOptions(orderItem.product_id);
      const requestedVariant = options.variants.find((variant) => variant.size === exchangeSize && variant.color === exchangeColor);
      if (!requestedVariant) throw new Error("Choose an available size and colour combination for the exchange.");
    }

    // Account email snapshot (Section V): Read strictly from customer account in DB, ignore client body
    const user = await db.findUserById(req.user.id);
    const customerEmail = (user?.email || req.user.email || "").trim().toLowerCase();
    if (!customerEmail || !customerEmail.includes("@")) {
      return res.status(400).json({
        success: false,
        error: "Tài khoản của bạn chưa có email hợp lệ. Vui lòng cập nhật email tại trang tài khoản trước khi gửi yêu cầu.",
      });
    }

    const quantityValue = Number(quantity || 1);
    const result = evaluateReturnRequest({ order, orderItem, request: { reasonCode, reasonDetail, quantity: quantityValue, conditionConfirmed } });
    const row = await db.createReturnRequest({
      id: id(), orderId: order.id, orderItemId: Number(orderItem.id), customerId: req.user.id,
      customerEmail,
      requestType, reasonCode, reasonDetail: String(reasonDetail || "").trim().slice(0, 1000), quantity: quantityValue,
      exchangeSize, exchangeColor, amount: result.requestedAmount || 0,
      status: result.status === "auto_approved" ? "return_authorized" : result.status,
      decisionReason: result.decisionReason, deadline: result.deadline || null,
    });
    return res.status(201).json({ success: true, request: row, decision: result.status, message: result.decisionReason });
  } catch (err) {
    console.error("[Return Request]", err);
    return res.status(400).json({ success: false, error: err.message || "Unable to submit return request." });
  }
}

export async function getReturnExchangeOptions(req, res) {
  try {
    const order = await db.getOrderById(String(req.params.orderId || ""));
    if (!order || order.customer_id !== req.user.id) return res.status(404).json({ success: false, error: "Order item not found." });
    const orderItem = order.items.find((item) => Number(item.id) === Number(req.params.orderItemId));
    if (!orderItem) return res.status(404).json({ success: false, error: "Order item not found." });
    return res.json({ success: true, ...(await db.getProductVariantOptions(orderItem.product_id)) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || "Unable to load exchange options." });
  }
}

export async function getReturnRequests(req, res) {
  try {
    const customerId = req.user.role === "customer" ? req.user.id : null;
    return res.json({ success: true, requests: await db.getReturnRequests({ customerId }) });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
}

export async function updateReturnRequest(req, res) {
  try {
    const existing = await db.getReturnRequestById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: "Return request not found." });
    const { action, note, refundReference } = req.body || {};
    const staffName = `${req.user.name} (${req.user.role.toUpperCase()})`;
    let fields;
    if (action === "receive") {
      if (!(["return_authorized", "in_transit"].includes(existing.status))) throw new Error("Only an authorised or in-transit return can be received.");
      fields = { status: "received", received: true, inspectionNote: String(note || "").trim() || "Package received; awaiting physical inspection." };
    } else if (action === "pass_inspection") {
      if (existing.status !== "received") throw new Error("Receive the returned item before completing inspection.");
      if (!String(note || "").trim()) throw new Error("Add an inspection note before approving the item.");
      fields = { status: "inspection_passed", inspectionNote: String(note).trim() };
    } else if (action === "fail_inspection") {
      if (existing.status !== "received") throw new Error("Receive the returned item before completing inspection.");
      if (!String(note || "").trim()) throw new Error("Add the reason inspection failed.");
      fields = { status: "inspection_failed", inspectionNote: String(note).trim() };
    } else if (action === "refund") {
      // Role Segregation (Section IV): Staff can inspect & exchange, but financial refund is ADMIN ONLY
      if (req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          error: "Quyền thực hiện hoàn tiền tài chính chỉ dành riêng cho Quản trị viên (Admin). Nhân viên không thể thực hiện hoàn tiền.",
        });
      }
      if (existing.status !== "inspection_passed") throw new Error("Refund is available only after a passed physical inspection.");
      if (!refundReference || !String(refundReference).trim()) {
        throw new Error("Vui lòng cung cấp mã tham chiếu đối soát hoàn tiền (chuyển khoản hoặc cổng thanh toán).");
      }
      await db.processReturnRefund({ requestId: existing.id, refundedBy: staffName, refundReference: String(refundReference).trim(), note });
      return res.json({ success: true, request: await db.getReturnRequestById(existing.id) });
    } else if (action === "exchange") {
      if (existing.status !== "inspection_passed" || existing.request_type !== "exchange") throw new Error("Exchange can be completed only after inspection passes for an exchange request.");
      await db.processReturnExchange({ requestId: existing.id, processedBy: staffName, note: String(note || "Exchange arranged by Maison Rue.").trim() });
      return res.json({ success: true, request: await db.getReturnRequestById(existing.id) });
    } else if (action === "decline") {
      if (!String(note || "").trim()) throw new Error("Add a reason for declining the request.");
      fields = { status: "auto_declined", resolutionNote: String(note).trim() };
    } else if (action === "manual_authorize") {
      if (existing.status !== "manual_review") throw new Error("Only requests in manual review can be authorised here.");
      fields = { status: "return_authorized", resolutionNote: String(note || "Authorised after Client Care review.").trim() };
    } else if (action === "transit") {
      if (existing.status !== "return_authorized") throw new Error("Only an authorised return can be marked in transit.");
      fields = { status: "in_transit" };
    } else throw new Error("Unknown return action.");
    return res.json({ success: true, request: await db.updateReturnRequest(existing.id, fields) });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}
