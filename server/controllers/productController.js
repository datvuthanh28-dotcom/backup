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

    if (!note || note.trim().length < 5) {
      return res.status(400).json({
        success: false,
        error: "Vui lòng nhập lý do điều chỉnh tồn kho (tối thiểu 5 ký tự) để lưu vết kiểm toán.",
      });
    }

    const performedBy = `${req.user.name} (${req.user.role.toUpperCase()})`;
    const result = await db.updateProductStock(req.params.id, stock, performedBy, note.trim());

    if (!result.success) {
      return res.status(404).json({ success: false, error: result.error });
    }

    return res.json({ success: true, message: "Cập nhật tồn kho thành công.", stock: result.stock });
  } catch (err) {
    console.error("[Update Stock] Error:", err);
    return res.status(500).json({ success: false, error: "Lỗi hệ thống khi cập nhật tồn kho." });
  }
}

export async function updateVariantStock(req, res) {
  try {
    const { stock, minStock, maxStock, note } = req.body;
    if (!Number.isInteger(Number(stock)) || Number(stock) < 0) {
      return res.status(400).json({ success: false, error: "Số lượng biến thể phải là số nguyên không âm." });
    }
    if (!Number.isInteger(Number(minStock)) || Number(minStock) < 0) {
      return res.status(400).json({ success: false, error: "Mức tồn tối thiểu phải là số nguyên không âm." });
    }
    if (!Number.isInteger(Number(maxStock)) || Number(maxStock) <= Number(minStock)) {
      return res.status(400).json({ success: false, error: "Mức tồn tối đa phải là số nguyên và lớn hơn mức tối thiểu." });
    }
    if (!note || note.trim().length < 5) {
      return res.status(400).json({ success: false, error: "Vui lòng nhập lý do điều chỉnh tối thiểu 5 ký tự." });
    }
    const performedBy = `${req.user.name} (${req.user.role.toUpperCase()})`;
    const result = await db.updateVariantStock(req.params.id, req.params.variantId, Number(stock), Number(minStock), Number(maxStock), performedBy, note.trim());
    return res.json({ success: true, message: "Cập nhật tồn kho biến thể thành công.", ...result });
  } catch (err) {
    console.error("[Update Variant Stock] Error:", err);
    const notFound = err.message.includes("Không tìm thấy biến thể");
    return res.status(notFound ? 404 : 500).json({ success: false, error: notFound ? err.message : "Lỗi hệ thống khi cập nhật tồn kho biến thể." });
  }
}

export async function updateVariantPricing(req, res) {
  try {
    const costPrice = Number(req.body.costPrice), floorPrice = Number(req.body.floorPrice);
    if (!Number.isFinite(costPrice) || !Number.isFinite(floorPrice)) return res.status(400).json({ success: false, error: "Giá vốn và giá sàn phải là số hợp lệ." });
    const result = await db.updateVariantPricing(req.params.id, req.params.variantId, costPrice, floorPrice);
    return res.json({ success: true, message: "Đã cập nhật giá vốn và giá sàn.", ...result });
  } catch (err) { return res.status(400).json({ success: false, error: err.message }); }
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

