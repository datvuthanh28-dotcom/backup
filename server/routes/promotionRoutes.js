import { Router } from "express";
import { approvePromotion, archivePromotion, catalogPromotionPrices, createPromotion, listPromotions, previewPromotion, promotionReport, promotionSuggestions, simulatePromotion, updatePromotion, updatePromotionStatus } from "../controllers/promotionController.js";
import { authenticateToken, optionalAuthenticateToken, requireRole } from "../middleware/auth.js";

const router = Router();
const safe = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
router.post("/preview", optionalAuthenticateToken, previewPromotion);
router.get("/catalog-prices", catalogPromotionPrices);
router.get("/admin", authenticateToken, requireRole("admin"), safe(listPromotions));
router.get("/admin/suggestions", authenticateToken, requireRole("admin"), safe(promotionSuggestions));
router.post("/admin/simulate", authenticateToken, requireRole("admin"), safe(simulatePromotion));
router.post("/admin", authenticateToken, requireRole("admin"), createPromotion);
router.put("/admin/:id", authenticateToken, requireRole("admin"), updatePromotion);
router.patch("/admin/:id/status", authenticateToken, requireRole("admin"), updatePromotionStatus);
router.patch("/admin/:id/approval", authenticateToken, requireRole("admin"), approvePromotion);
router.delete("/admin/:id", authenticateToken, requireRole("admin"), archivePromotion);
router.get("/admin-report", authenticateToken, requireRole("admin"), safe(promotionReport));
export default router;
