import { Router } from "express";
import { authenticateToken, optionalAuthenticateToken, requireRole } from "../middleware/auth.js";
import { getAccount, getAddressSuggestions, verifyAddress, addAddress, updateAddress, deleteAddress, updatePreferences, updateProfile } from "../controllers/customerController.js";
import { deleteReview, getFavorites, getMyReviewEligibility, getReviewEligibility, saveReview, setFavorite } from "../controllers/engagementController.js";
import { clearCart, getCart, saveCart } from "../controllers/cartController.js";
const router = Router();

// Public / Guest accessible address utility routes (for checkout autocomplete & evidence verification)
router.get("/address-suggestions", optionalAuthenticateToken, getAddressSuggestions);
router.post("/verify-address", optionalAuthenticateToken, verifyAddress);

// Personal customer account routes (Strict authentication & Customer role required)
router.use(authenticateToken, requireRole("customer"));
router.get("/account", getAccount);
router.post("/addresses", addAddress);
router.patch("/addresses/:id", updateAddress);
router.delete("/addresses/:id", deleteAddress);
router.patch("/preferences", updatePreferences);
router.patch("/profile", updateProfile);
router.put("/profile", updateProfile);
router.get("/favorites", getFavorites);
router.put("/favorites/:productId", setFavorite);
router.get("/reviews", getMyReviewEligibility);
router.get("/reviews/:productId/eligibility", getReviewEligibility);
router.put("/reviews/:productId", saveReview);
router.delete("/reviews/:productId", deleteReview);
router.get("/cart", getCart);
router.put("/cart", saveCart);
router.delete("/cart", clearCart);
export default router;
