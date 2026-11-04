import { Router } from "express";
import { getRevenueReport } from "../controllers/reportController.js";
import { getAdminReviews, getProductInsights, moderateReview } from "../controllers/engagementController.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";

const router = Router();

// Revenue reports are strictly reserved for Admin
router.get("/revenue", authenticateToken, requireRole("admin"), getRevenueReport);
router.get("/product-insights", authenticateToken, requireRole("admin"), getProductInsights);
router.get("/reviews", authenticateToken, requireRole("admin"), getAdminReviews);
router.patch("/reviews/:id", authenticateToken, requireRole("admin"), moderateReview);

export default router;

