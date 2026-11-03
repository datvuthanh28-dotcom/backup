import { Router } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import {
  getAllOrders,
  getOrderById,
  createOrder,
  updateOrderStatus,
  cancelOrder,
  confirmOrderPayment,
  processOrderRefund,
} from "../controllers/orderController.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import { db } from "../config/db.js";

dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET || "maison_rue_super_secret_jwt_key_2026_luxury_old_money";

const router = Router();

// Soft authenticate token for createOrder (allows guest or logged-in customer)
async function optionalAuth(req, res, next) {
  let token = req.cookies?.maison_rue_token;
  if (!token && req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await db.findUserById(decoded.id);
      if (user && user.is_active !== false) {
        req.user = { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone };
      }
    } catch {
      // ignore invalid token for optional auth
    }
  }
  next();
}

router.get("/", authenticateToken, getAllOrders);
router.get("/:id", authenticateToken, getOrderById);
router.post("/", optionalAuth, createOrder);
router.patch("/:id/status", authenticateToken, requireRole("staff", "admin"), updateOrderStatus);
router.post("/:id/cancel", authenticateToken, cancelOrder);
router.post("/:id/payment/confirm", authenticateToken, requireRole("staff", "admin"), confirmOrderPayment);
// Refund execution affects cash flow and is intentionally reserved for Admin.
// Staff can identify refund-pending orders, but cannot approve/execute the refund.
router.post("/:id/payment/refund", authenticateToken, requireRole("admin"), processOrderRefund);

export default router;

