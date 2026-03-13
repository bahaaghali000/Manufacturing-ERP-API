import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import * as poController from "../controllers/poController";

const router = Router();

router.get("/", authenticate, authorize("view_pos"), poController.getPOs);
router.get("/:id", authenticate, authorize("view_pos"), poController.getPOById);
router.post("/", authenticate, authorize("create_po"), poController.createPO);
router.post("/convert", authenticate, authorize("create_po"), poController.convertPRtoPO);
router.patch("/:id/status", authenticate, authorize("approve_po"), poController.updatePOStatus);
router.post("/:id/receive", authenticate, authorize("receive_goods"), poController.receiveGoods);

export default router;
