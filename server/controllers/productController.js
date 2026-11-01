import { db } from "../config/db.js";

export async function getAllProducts(req, res) {
  try {
    const products = await db.getAllProducts();
    return res.json({ success: true, products });
  } catch (err) {
    console.error("[Products] Error:", err);
    return res.status(500).json({ success: false, error: "Không thể lấy danh sách sản phẩm." });
  }
}

export async function getProductById(req, res) {
  try {
    const product = await db.getProductById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, error: "Không tìm thấy sản phẩm." });
    }
    return res.json({ success: true, product });
  } catch (err) {
    console.error("[Product Detail] Error:", err);
    return res.status(500).json({ success: false, error: "Lỗi khi lấy thông tin sản phẩm." });
  }
}

export async function updateStock(req, res) {
  try {
    const { stock, note } = req.body;
    if (stock === undefined || stock < 0) {
      return res.status(400).json({ success: false, error: "Số lượng tồn kho phải là số không âm." });
    }

    const performedBy = `${req.user.name} (${req.user.role.toUpperCase()})`;
    const result = await db.updateProductStock(req.params.id, stock, performedBy, note);

    if (!result.success) {
      return res.status(404).json({ success: false, error: result.error });
    }

    return res.json({ success: true, message: "Cập nhật tồn kho thành công.", stock: result.stock });
  } catch (err) {
    console.error("[Update Stock] Error:", err);
    return res.status(500).json({ success: false, error: "Lỗi hệ thống khi cập nhật tồn kho." });
  }
}

export async function getInventoryMovements(req, res) {
  try {
    const productId = req.query.productId || null;
    const movements = await db.getInventoryMovements(productId);
    return res.json({ success: true, movements });
  } catch (err) {
    console.error("[Movements] Error:", err);
    return res.status(500).json({ success: false, error: "Lỗi khi lấy lịch sử biến động kho." });
  }
}

