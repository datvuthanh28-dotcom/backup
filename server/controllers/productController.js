import { db } from "../config/db.js";
import { sendLowStockAlertEmail } from "../services/emailService.js";

// Helper to sanitize costPrice for public/customer viewers
function sanitizeForViewer(product, isStaffOrAdmin) {
  if (isStaffOrAdmin || !product) return product;
  const sanitizedVariants = product.variants?.map((v) => {
    const sanitized = { ...v };
    delete sanitized.costPrice;
    delete sanitized.cost_price;
    return sanitized;
  });
  return {
    ...product,
    variants: sanitizedVariants,
  };
}

export async function getAllProducts(req, res) {
  try {
    const isStaffOrAdmin = req.user && (req.user.role === "admin" || req.user.role === "staff");
    const products = await db.getAllProducts();
    const sanitized = products.map((p) => sanitizeForViewer(p, isStaffOrAdmin));
    return res.json({ success: true, products: sanitized });
  } catch (err) {
    console.error("[Products] Error:", err);
    return res.status(500).json({ success: false, error: "Không thể lấy danh sách sản phẩm." });
  }
}

export async function getProductById(req, res) {
  try {
    const isStaffOrAdmin = req.user && (req.user.role === "admin" || req.user.role === "staff");
    const product = await db.getProductById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, error: "Không tìm thấy sản phẩm." });
    }
    return res.json({ success: true, product: sanitizeForViewer(product, isStaffOrAdmin) });
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

    if (result?.success && result.stock <= result.minStock) {
      const todayUtc = new Date().toISOString().slice(0, 10);
      await sendLowStockAlertEmail(
        {
          variantId: result.variantId,
          sku: result.sku || req.params.id,
          productName: result.productName || "Maison Rue Product",
          variantInfo: result.variantInfo || "",
          currentStock: result.stock,
          minStock: result.minStock,
          note: `Staff (${req.user.name}) cập nhật tồn kho trên hệ thống xuống ngưỡng cảnh báo (${result.stock}/${result.minStock} sản phẩm). Lý do: ${note.trim()}`,
        },
        { contextKey: `manual:${result.variantId}:${todayUtc}:${result.stock}:${result.minStock}` }
      ).catch((e) => console.warn("[Email] Inventory alert failed:", e?.message || e));
    }

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

// ====================================================
// ADMIN PRODUCT & SKU MANAGEMENT HANDLERS
// ====================================================

export async function getAllProductsAdmin(req, res) {
  try {
    const products = await db.getAllProductsAdmin();
    return res.json({ success: true, products });
  } catch (err) {
    console.error("[Admin Products] Error:", err);
    return res.status(500).json({ success: false, error: err.message || "Lỗi khi lấy danh sách sản phẩm quản trị." });
  }
}

export async function createProductAdmin(req, res) {
  try {
    const actor = `${req.user.name} (${req.user.role.toUpperCase()})`;
    const result = await db.createProductAdmin(req.body, actor);
    return res.status(201).json({ success: true, message: "Đã tạo sản phẩm thành công.", ...result });
  } catch (err) {
    console.error("[Create Product Admin] Error:", err);
    return res.status(400).json({ success: false, error: err.message || "Lỗi khi tạo sản phẩm mới." });
  }
}

export async function updateProductAdmin(req, res) {
  try {
    const actor = `${req.user.name} (${req.user.role.toUpperCase()})`;
    const result = await db.updateProductAdmin(req.params.id, req.body, actor);
    return res.json({ success: true, message: "Cập nhật sản phẩm thành công.", ...result });
  } catch (err) {
    console.error("[Update Product Admin] Error:", err);
    return res.status(400).json({ success: false, error: err.message || "Lỗi khi cập nhật sản phẩm." });
  }
}

export async function softDeleteProductAdmin(req, res) {
  try {
    const actor = `${req.user.name} (${req.user.role.toUpperCase()})`;
    const reason = req.body?.reason || "Admin tạm ngừng kinh doanh sản phẩm";
    const result = await db.softDeleteProductAdmin(req.params.id, actor, reason);
    return res.json({ success: true, message: "Đã tạm ngừng kinh doanh sản phẩm (xóa mềm).", ...result });
  } catch (err) {
    console.error("[Soft Delete Product Admin] Error:", err);
    return res.status(400).json({ success: false, error: err.message || "Lỗi khi ngừng kinh doanh sản phẩm." });
  }
}

export async function restoreProductAdmin(req, res) {
  try {
    const actor = `${req.user.name} (${req.user.role.toUpperCase()})`;
    const result = await db.restoreProductAdmin(req.params.id, actor);
    return res.json({ success: true, message: "Đã khôi phục kinh doanh sản phẩm thành công.", ...result });
  } catch (err) {
    console.error("[Restore Product Admin] Error:", err);
    return res.status(400).json({ success: false, error: err.message || "Lỗi khi khôi phục sản phẩm." });
  }
}

export async function createVariantAdmin(req, res) {
  try {
    const actor = `${req.user.name} (${req.user.role.toUpperCase()})`;
    const result = await db.createVariantAdmin(req.params.id, req.body, actor);
    return res.status(201).json({ success: true, message: "Đã tạo SKU biến thể mới thành công.", ...result });
  } catch (err) {
    console.error("[Create Variant Admin] Error:", err);
    return res.status(400).json({ success: false, error: err.message || "Lỗi khi tạo SKU biến thể." });
  }
}

export async function updateVariantAdmin(req, res) {
  try {
    const actor = `${req.user.name} (${req.user.role.toUpperCase()})`;
    const result = await db.updateVariantAdmin(req.params.id, req.params.variantId, req.body, actor);
    return res.json({ success: true, message: "Cập nhật SKU biến thể thành công.", ...result });
  } catch (err) {
    console.error("[Update Variant Admin] Error:", err);
    return res.status(400).json({ success: false, error: err.message || "Lỗi khi cập nhật SKU biến thể." });
  }
}

export async function softDeleteVariantAdmin(req, res) {
  try {
    const actor = `${req.user.name} (${req.user.role.toUpperCase()})`;
    const reason = req.body?.reason || "Admin tạm ngừng kinh doanh SKU";
    const result = await db.softDeleteVariantAdmin(req.params.id, req.params.variantId, actor, reason);
    return res.json({ success: true, message: "Đã tạm ngừng kinh doanh SKU biến thể.", ...result });
  } catch (err) {
    console.error("[Soft Delete Variant Admin] Error:", err);
    return res.status(400).json({ success: false, error: err.message || "Lỗi khi ngừng kinh doanh SKU." });
  }
}

export async function restoreVariantAdmin(req, res) {
  try {
    const actor = `${req.user.name} (${req.user.role.toUpperCase()})`;
    const result = await db.restoreVariantAdmin(req.params.id, req.params.variantId, actor);
    return res.json({ success: true, message: "Đã khôi phục kinh doanh SKU biến thể thành công.", ...result });
  } catch (err) {
    console.error("[Restore Variant Admin] Error:", err);
    return res.status(400).json({ success: false, error: err.message || "Lỗi khi khôi phục SKU." });
  }
}
