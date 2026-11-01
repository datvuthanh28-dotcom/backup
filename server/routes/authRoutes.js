import { Router } from "express";
import {
  customerLogin,
  staffLogin,
  adminLogin,
  registerCustomer,
  logout,
  getMe,
} from "../controllers/authController.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

router.post("/customer/login", customerLogin);
router.post("/staff/login", staffLogin);
router.post("/admin/login", adminLogin);
router.post("/register", registerCustomer);
router.post("/logout", logout);
router.get("/me", authenticateToken, getMe);

export default router;

