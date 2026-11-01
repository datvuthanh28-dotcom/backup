import { db } from "../config/db.js";

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
    const { name, email, phone, address, paymentMethod, items, notes } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: "Giỏ hàng không có sản phẩm để tạo đơn." });
    }

    if (!name || !email || !phone || !address) {
      return res.status(400).json({ success: false, error: "Vui lòng nhập đầy đủ thông tin giao nhận." });
    }

    const customerId = req.user ? req.user.id : `usr_guest_${Date.now()}`;
    const orderId = `MR-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

    const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const orderData = {
      id: orderId,
      customer_id: customerId,
      customer_name: name.trim(),
      customer_email: email.trim().toLowerCase(),
      customer_phone: phone.trim(),
      shipping_address: address.trim(),
      shipping_fee: 0, // Free luxury shipping
      total_amount: totalAmount,
      notes: (notes || "").trim(),
    };

    const newOrder = await db.createOrderWithTransaction({
      orderData,
      items,
      paymentData: { method: paymentMethod || "cod" },
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

    const updatedBy = `${req.user.name} (${req.user.role.toUpperCase()})`;
    const updatedOrder = await db.updateOrderStatusWithValidation({
      orderId,
      newStatus: status,
      note,
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

