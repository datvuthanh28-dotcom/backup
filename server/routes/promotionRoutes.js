import { Router } from "express";
import { archivePromotion, catalogPromotionPrices, createPromotion, listPromotions, previewPromotion, promotionReport, updatePromotion, updatePromotionStatus } from "../controllers/promotionController.js";
import { authenticateToken, optionalAuthenticateToken, requireRole } from "../middleware/auth.js";

const router = Router();
router.post("/preview", optionalAuthenticateToken, previewPromotion);
router.get("/catalog-prices", catalogPromotionPrices);
router.get("/admin", authenticateToken, requireRole("admin"), listPromotions);
router.post("/admin", authenticateToken, requireRole("admin"), createPromotion);
router.put("/admin/:id", authenticateToken, requireRole("admin"), updatePromotion);
router.patch("/admin/:id/status", authenticateToken, requireRole("admin"), updatePromotionStatus);
router.delete("/admin/:id", authenticateToken, requireRole("admin"), archivePromotion);
router.get("/admin-report", authenticateToken, requireRole("admin"), promotionReport);
export default router;
