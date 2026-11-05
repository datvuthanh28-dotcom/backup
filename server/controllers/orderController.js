import { db } from "../config/db.js";
import { calculatePromotions } from "../services/promotionService.js";

export async function getAllOrders(req, res) {
  try {
    const user = req.user;
    if (user.role === "customer") {
      const orders = await db.getOrdersByCustomer(user.id);
      return res.json({ success: true, orders });
    }

    // Staff and Admin can view all orders
    const orders = await db.getAllOrders();
    return res.json({ success: true, orders });
  } catch (err) {
    console.error("[Get Orders] Error:", err);
    return res.status(500).json({ success: false, error: "Không thể lấy danh sách đơn hàng." });
  }
}

export async function getOrderById(req, res) {
  try {
    const order = await db.getOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: "Không tìm thấy đơn hàng." });
    }

    // Ensure customer can only view their own order
    if (req.user.role === "customer" && order.customer_id !== req.user.id) {
      return res.status(403).json({ success: false, error: "Bạn không có quyền xem đơn hàng này." });
    }

    return res.json({ success: true, order });
  } catch (err) {
    console.error("[Get Order] Error:", err);
    return res.status(500).json({ success: false, error: "Lỗi hệ thống khi lấy thông tin đơn hàng." });
  }
}

export async function createOrder(req, res) {
  try {
    const { name, email, phone, address, paymentMethod, items, notes, promotionCode } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: "Giỏ hàng không có sản phẩm để tạo đơn." });
    }

    if (!name || !email || !phone || !address) {
      return res.status(400).json({ success: false, error: "Vui lòng nhập đầy đủ thông tin giao nhận." });
    }

    const customerId = req.user ? req.user.id : `usr_guest_${Date.now()}`;
    const orderId = `MR-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

    const normalizedItems = [];
    for (const item of items) {
      const product = await db.getProductById(item.id);
      if (!product) throw new Error("Một sản phẩm trong giỏ hàng không còn tồn tại.");
      const quantity = Math.max(1, Number.parseInt(item.quantity, 10) || 1);
      const variant = item.variantId ? product.variants?.find((entry) => entry.id === item.variantId) : null;
      if (item.variantId && !variant) throw new Error("Biến thể sản phẩm không hợp lệ.");
      normalizedItems.push({
        ...item,
        name: product.name,
        price: variant?.price ?? Number(product.price),
        floorPrice: Number(variant?.floorPrice || 0),
        costPrice: Number(variant?.costPrice || 0),
        quantity,
        selectedColor: variant?.color ?? item.selectedColor,
        selectedSize: variant?.size ?? item.selectedSize,
        sku: variant?.sku ?? item.sku,
        variantSku: variant?.sku ?? item.sku,
        image: product.colorImages?.[variant?.color ?? item.selectedColor]?.[0] || product.images?.[0] || null,
        category: product.category,
        productType: product.productType,
        subcategory: product.subcategory,
        audience: product.audience,
        gender: product.gender,
      });
    }
    const pricing = await calculatePromotions({ items: normalizedItems, code: promotionCode, customerId: req.user?.role === "customer" ? req.user.id : null, shippingFee: 0 });

    const orderData = {
      id: orderId,
      customer_id: customerId,
      customer_name: name.trim(),
      customer_email: email.trim().toLowerCase(),
      customer_phone: phone.trim(),
      shipping_address: address.trim(),
      shipping_fee: pricing.shippingFeeOriginal - pricing.shippingDiscountTotal,
      total_amount: pricing.finalTotal,
      original_subtotal: pricing.originalSubtotal,
      product_discount_total: pricing.productDiscountTotal,
      code_discount_total: pricing.codeDiscountTotal,
      shipping_fee_original: pricing.shippingFeeOriginal,
      shipping_discount_total: pricing.shippingDiscountTotal,
      promotion_code: pricing.code,
      promotion_snapshot_json: JSON.stringify({ code: pricing.code, automaticPromotions: pricing.automaticPromotions.map((promotion) => ({ id: promotion.id, name: promotion.name, type: promotion.discount_type, value: promotion.discount_value })), codePromotion: pricing.codePromotion ? { id: pricing.codePromotion.id, name: pricing.codePromotion.name, type: pricing.codePromotion.discount_type, value: pricing.codePromotion.discount_value } : null }),
      notes: (notes || "").trim(),
    };

    const newOrder = await db.createOrderWithTransaction({
      orderData,
      items: pricing.items,
      paymentData: { method: paymentMethod || "cod" },
      promotionData: pricing,
    });

    return res.status(201).json({ success: true, order: newOrder });
  } catch (err) {
    console.error("[Create Order] Error:", err);
    return res.status(400).json({ success: false, error: err.message || "Lỗi khi xử lý đặt hàng." });
  }
}

export async function updateOrderStatus(req, res) {
  try {
    const { status, note } = req.body;
    const orderId = req.params.id;

    if (!status) {
      return res.status(400).json({ success: false, error: "Trạng thái mới là bắt buộc." });
    }
    const normalizedNote = String(note || "").trim();
    if (status === "cancelled" && normalizedNote.length < 5) {
      return res.status(400).json({ success: false, error: "Vui lòng nhập lý do hủy đơn (tối thiểu 5 ký tự)." });
    }

    const automaticNotes = {
      confirmed: "Staff đã xác nhận đơn hàng.",
      processing: "Đơn hàng đã được chuyển sang khâu chuẩn bị.",
      shipping: "Đơn hàng đã được bàn giao để vận chuyển.",
      delivered: "Đơn hàng đã được xác nhận giao thành công.",
    };

    const updatedBy = `${req.user.name} (${req.user.role.toUpperCase()})`;
    const updatedOrder = await db.updateOrderStatusWithValidation({
      orderId,
      newStatus: status,
      note: normalizedNote || automaticNotes[status] || "Staff cập nhật trạng thái đơn hàng.",
      updatedBy,
    });

    return res.json({ success: true, order: updatedOrder, message: "Cập nhật trạng thái đơn hàng thành công." });
  } catch (err) {
    console.error("[Update Status] Error:", err);
    return res.status(400).json({ success: false, error: err.message || "Lỗi cập nhật trạng thái đơn." });
  }
}

export async function cancelOrder(req, res) {
  try {
    const orderId = req.params.id;
    const { note } = req.body;
    const order = await db.getOrderById(orderId);

    if (!order) {
      return res.status(404).json({ success: false, error: "Không tìm thấy đơn hàng." });
    }

    // Customer cancellation permissions
    if (req.user.role === "customer") {
      if (order.customer_id !== req.user.id) {
        return res.status(403).json({ success: false, error: "Bạn không có quyền hủy đơn hàng của người khác." });
      }
      if (!["pending", "confirmed"].includes(order.order_status)) {
        return res.status(400).json({
          success: false,
          error: `Đơn hàng đang ở trạng thái "${order.order_status}" nên không thể tự hủy. Vui lòng liên hệ hotline.`,
        });
      }
    }

    const cancelledBy = `${req.user.name} (${req.user.role.toUpperCase()})`;
    const updatedOrder = await db.updateOrderStatusWithValidation({
      orderId,
      newStatus: "cancelled",
      note: note || "Khách hàng yêu cầu hủy đơn hàng.",
      updatedBy: cancelledBy,
    });

    return res.json({
      success: true,
      order: updatedOrder,
      message: "Hủy đơn hàng thành công. Tồn kho sản phẩm đã được tự động hoàn trả vào kho.",
    });
  } catch (err) {
    console.error("[Cancel Order] Error:", err);
    return res.status(400).json({ success: false, error: err.message || "Lỗi khi hủy đơn hàng." });
  }
}

export async function confirmOrderPayment(req, res) {
  try {
    const orderId = req.params.id;
    const { transactionReference, note } = req.body;

    const order = await db.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: "Không tìm thấy đơn hàng." });
    }

    if (!order.payment) {
      return res.status(409).json({
        success: false,
        error: "Đơn hàng chưa có hồ sơ thanh toán. Vui lòng kiểm tra dữ liệu trước khi xác nhận thu tiền.",
      });
    }

    const paymentMethod = order.payment.payment_method;
    if (paymentMethod === "cod" && order.order_status !== "delivered") {
      return res.status(400).json({
        success: false,
        error: "Thanh toán COD chỉ được xác nhận sau khi đơn hàng đã giao thành công.",
      });
    }

    if (paymentMethod === "bank_transfer" && !transactionReference?.trim()) {
      return res.status(400).json({
        success: false,
        error: "Đơn chuyển khoản phải có mã giao dịch hoặc mã tham chiếu ngân hàng.",
      });
    }

    const confirmedBy = `${req.user.name} (${req.user.role.toUpperCase()})`;
    const normalizedReference = paymentMethod === "cod"
      ? `COD-${orderId}`
      : transactionReference.trim();
    const normalizedNote = note?.trim() || (paymentMethod === "cod" ? "Đã thu đủ tiền COD khi giao hàng" : "Đã đối soát giao dịch chuyển khoản");
    const updatedOrder = await db.confirmPayment({
      orderId,
      transactionReference: normalizedReference,
      note: normalizedNote,
      confirmedBy,
    });

    return res.json({
      success: true,
      order: updatedOrder,
      message: "Xác nhận thanh toán thành công.",
    });
  } catch (err) {
    console.error("[Confirm Payment] Error:", err);
    return res.status(400).json({ success: false, error: err.message || "Lỗi xác nhận thanh toán." });
  }
}

export async function processOrderRefund(req, res) {
  try {
    const orderId = req.params.id;
    const { refundReference, note } = req.body;

    const refundedBy = `${req.user.name} (${req.user.role.toUpperCase()})`;
    const updatedOrder = await db.processRefund({
      orderId,
      refundReference,
      note,
      refundedBy,
    });

    return res.json({
      success: true,
      order: updatedOrder,
      message: "Xử lý hoàn tiền thành công.",
    });
  } catch (err) {
    console.error("[Process Refund] Error:", err);
    return res.status(400).json({ success: false, error: err.message || "Lỗi khi xử lý hoàn tiền." });
  }
}


