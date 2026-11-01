import { Router } from "express";
import { getRevenueReport } from "../controllers/reportController.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";

const router = Router();

// Revenue reports are strictly reserved for Admin
router.get("/revenue", authenticateToken, requireRole("admin"), getRevenueReport);

export default router;

