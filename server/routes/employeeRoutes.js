import { Router } from "express";
import {
  getAllEmployees,
  createEmployee,
  updateEmployee,
  toggleEmployeeStatus,
} from "../controllers/employeeController.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";

const router = Router();

// All employee management routes are strictly reserved for Admin
router.use(authenticateToken, requireRole("admin"));

router.get("/", getAllEmployees);
router.post("/", createEmployee);
router.put("/:id", updateEmployee);
router.patch("/:id/status", toggleEmployeeStatus);

export default router;

