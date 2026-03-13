import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import * as vendorController from "../controllers/vendorController";

const router = Router();

router.get("/", authenticate, authorize("view_vendors"), vendorController.getVendors);
router.get("/:id", authenticate, authorize("view_vendors"), vendorController.getVendorById);
router.post("/", authenticate, authorize("manage_vendors"), vendorController.createVendor);
router.put("/:id", authenticate, authorize("manage_vendors"), vendorController.updateVendor);
router.delete("/:id", authenticate, authorize("manage_vendors"), vendorController.deleteVendor);

export default router;
