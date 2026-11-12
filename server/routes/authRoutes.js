import { Router } from "express";
import {
  customerLogin,
  staffLogin,
  adminLogin,
  registerCustomer,
  forgotPassword,
  resetPassword,
  logout,
  getMe,
} from "../controllers/authController.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

router.post("/customer/login", customerLogin);
router.post("/staff/login", staffLogin);
router.post("/admin/login", adminLogin);
router.post("/register", registerCustomer);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/logout", logout);
router.get("/me", authenticateToken, getMe);

export default router;

