import { Router } from "express";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import { getReturnExchangeOptions, getReturnRequests, submitReturnRequest, updateReturnRequest } from "../controllers/returnController.js";

const router = Router();
router.use(authenticateToken);
router.get("/", getReturnRequests);
router.get("/orders/:orderId/items/:orderItemId/exchange-options", requireRole("customer"), getReturnExchangeOptions);
router.post("/", requireRole("customer"), submitReturnRequest);
router.patch("/:id", requireRole("staff", "admin"), updateReturnRequest);
export default router;
