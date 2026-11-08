import { Router } from "express";
import { optionalAuthenticateToken } from "../middleware/auth.js";
import { handleChat } from "../controllers/chatController.js";

const router = Router();

// Public chat endpoint with optional authentication:
// - Supports public advisory for guests (Men, Women, Kids, Sizing, Materials, Prices)
// - Supports authenticated customer features (own orders, return navigation)
// - Rate limited and protected against prompt injection
router.post("/", optionalAuthenticateToken, handleChat);

export default router;
