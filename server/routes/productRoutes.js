import { Router, raw } from "express";
import {
  getAllProducts,
  getProductById,
  updateStock,
  updateVariantStock,
  updateVariantPricing,
  getInventoryMovements,
  getInventoryDocuments,
  createInventoryDocument,
  reverseInventoryDocument,
  getAllProductsAdmin,
  getProductCreateMetadata,
  createProductAdmin,
  updateProductAdmin,
  softDeleteProductAdmin,
  restoreProductAdmin,
  createVariantAdmin,
  updateVariantAdmin,
  softDeleteVariantAdmin,
  restoreVariantAdmin,
  uploadProductImage,
} from "../controllers/productController.js";
import { authenticateToken, optionalAuthenticateToken, requireRole } from "../middleware/auth.js";

const router = Router();

// Public / Authenticated Product Browsing
router.get("/", optionalAuthenticateToken, getAllProducts);
router.get("/inventory/movements", authenticateToken, requireRole("staff", "admin"), getInventoryMovements);
router.get("/inventory/documents", authenticateToken, requireRole("staff", "admin"), getInventoryDocuments);
router.post("/inventory/documents", authenticateToken, requireRole("staff", "admin"), createInventoryDocument);
router.post("/inventory/documents/:id/reverse", authenticateToken, requireRole("admin"), reverseInventoryDocument);

// ==========================================
// Admin Product & SKU Management Endpoints
// (Must be defined BEFORE /:id parameterized routes)
// ==========================================
router.get("/admin/all", authenticateToken, requireRole("admin"), getAllProductsAdmin);
router.get("/admin/create-metadata", authenticateToken, requireRole("admin"), getProductCreateMetadata);
router.post("/admin/images/upload", authenticateToken, requireRole("admin"), raw({ type: ["image/webp", "image/jpeg", "image/png"], limit: "8mb" }), uploadProductImage);
router.post("/admin", authenticateToken, requireRole("admin"), createProductAdmin);
router.put("/admin/:id", authenticateToken, requireRole("admin"), updateProductAdmin);
router.delete("/admin/:id", authenticateToken, requireRole("admin"), softDeleteProductAdmin);
router.post("/admin/:id/restore", authenticateToken, requireRole("admin"), restoreProductAdmin);

router.post("/admin/:id/variants", authenticateToken, requireRole("admin"), createVariantAdmin);
router.put("/admin/:id/variants/:variantId", authenticateToken, requireRole("admin"), updateVariantAdmin);
router.delete("/admin/:id/variants/:variantId", authenticateToken, requireRole("admin"), softDeleteVariantAdmin);
router.post("/admin/:id/variants/:variantId/restore", authenticateToken, requireRole("admin"), restoreVariantAdmin);

// Product Detail & Operational Stock
router.get("/:id", optionalAuthenticateToken, getProductById);
router.patch("/:id/stock", authenticateToken, requireRole("staff", "admin"), updateStock);
router.patch("/:id/variants/:variantId/stock", authenticateToken, requireRole("admin"), updateVariantStock);
router.patch("/:id/variants/:variantId/pricing", authenticateToken, requireRole("admin"), updateVariantPricing);

export default router;
