import { Router } from "express";
import { getPublicReviews } from "../controllers/engagementController.js";

const router = Router();
router.get("/products/:productId/reviews", getPublicReviews);
export default router;
