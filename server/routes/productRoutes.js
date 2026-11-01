import { Router } from "express";
import {
  getAllProducts,
  getProductById,
  updateStock,
  getInventoryMovements,
} from "../controllers/productController.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";

const router = Router();

router.get("/", getAllProducts);
router.get("/inventory/movements", authenticateToken, requireRole("staff", "admin"), getInventoryMovements);
router.get("/:id", getProductById);
router.patch("/:id/stock", authenticateToken, requireRole("staff", "admin"), updateStock);

export default router;

