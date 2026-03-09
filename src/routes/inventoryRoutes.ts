import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import * as inventoryController from "../controllers/inventoryController";

const router = Router();

router.get("/", authenticate, authorize("view_inventory"), inventoryController.getInventory);
router.get("/low-stock", authenticate, authorize("view_inventory"), inventoryController.getLowStock);
router.get("/warehouses", authenticate, authorize("view_inventory"), inventoryController.getWarehouses);
router.post("/adjust", authenticate, authorize("update_inventory"), inventoryController.adjustInventory);

export default router;
