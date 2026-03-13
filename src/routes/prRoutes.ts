import { Router } from "express";
import { 
  createPR, 
  getPRs, 
  getPRById, 
  updatePRStatus 
} from "../controllers/prController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

// All PR routes require authentication
router.use(authenticate);

router.get("/", authorize("pr.view"), getPRs);
router.get("/:id", authorize("pr.view"), getPRById);
router.post("/", authorize("pr.create"), createPR);
router.patch("/:id/status", authorize("pr.approve"), updatePRStatus);

export default router;
