import { Router } from "express";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import { handleCustomerChat } from "../controllers/chatController.js";

const router = Router();

// Only logged-in, active accounts with role === 'customer' can access the chatbot API
router.post("/", authenticateToken, requireRole("customer"), handleCustomerChat);

export default router;

