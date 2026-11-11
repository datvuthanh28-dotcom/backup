import { Router } from "express";
import { getOperationalReviews, removeReviewReply, saveReviewReply } from "../controllers/engagementController.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";

const router = Router();
router.get("/", authenticateToken, requireRole("staff", "admin"), getOperationalReviews);
router.put("/:id/reply", authenticateToken, requireRole("staff", "admin"), saveReviewReply);
router.delete("/:id/reply", authenticateToken, requireRole("staff", "admin"), removeReviewReply);
export default router;
