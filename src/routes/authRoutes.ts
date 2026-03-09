import { Router } from "express";
import { login, refresh, logout, getMe } from "../controllers/authController";
import { authenticate } from "../middleware/auth";

const router = Router();

router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.get("/me", authenticate, getMe);

export default router;
