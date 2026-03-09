import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import * as itemController from "../controllers/itemController";

const router = Router();

router.get("/", authenticate, authorize("view_items"), itemController.getItems);
router.get("/:id", authenticate, authorize("view_items"), itemController.getItemById);
router.post("/", authenticate, authorize("manage_items"), itemController.createItem);
router.put("/:id", authenticate, authorize("manage_items"), itemController.updateItem);
router.delete("/:id", authenticate, authorize("manage_items"), itemController.deleteItem);

export default router;
