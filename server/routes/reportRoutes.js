import { Router } from "express";
import { getRevenueReport } from "../controllers/reportController.js";
import {
  getAdminReviews,
  getProductInsights,
  moderateReview,
  auditReviewsNow,
  getReviewAuditRuns,
  getReviewAuditRunById,
  decideReview,
  bulkDecideReviews,
  getReviewModerationHistory,
  getWishlistAnalytics,
} from "../controllers/engagementController.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";

const router = Router();

// Revenue reports are strictly reserved for Admin
router.get("/revenue", authenticateToken, requireRole("admin"), getRevenueReport);
router.get("/product-insights", authenticateToken, requireRole("admin"), getProductInsights);

// Wishlist Analytics Dashboard (Section C)
router.get("/wishlist", authenticateToken, requireRole("admin"), getWishlistAnalytics);

// Reviews & Weekly AI Audit Endpoints (Section B)
router.get("/reviews", authenticateToken, requireRole("admin"), getAdminReviews);
router.post("/reviews/audit-now", authenticateToken, requireRole("admin"), auditReviewsNow);
router.get("/reviews/audit-runs", authenticateToken, requireRole("admin"), getReviewAuditRuns);
router.get("/reviews/audit-runs/:runId", authenticateToken, requireRole("admin"), getReviewAuditRunById);
router.get("/reviews/history", authenticateToken, requireRole("admin"), getReviewModerationHistory);
router.patch("/reviews/:id", authenticateToken, requireRole("admin"), moderateReview);
router.patch("/reviews/:id/decision", authenticateToken, requireRole("admin"), decideReview);
router.post("/reviews/bulk-decision", authenticateToken, requireRole("admin"), bulkDecideReviews);

export default router;
