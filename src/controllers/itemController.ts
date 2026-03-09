import { Request, Response } from "express";
import { prisma } from "../config/db";
import { asyncHandler } from "../utils/asyncHandler";

export const getItems = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const search = (req.query.search as string) || "";
  const skip = (page - 1) * limit;

  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { sku: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [items, total] = await Promise.all([
    prisma.item.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.item.count({ where }),
  ]);

  res.json({
    success: true,
    data: items,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

export const getItemById = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const item = await prisma.item.findUnique({
    where: { id: parseInt(id) },
    include: {
      inventory: {
        include: {
          warehouse: true,
        },
      },
    },
  });

  if (!item) {
    return res.status(404).json({ message: "Item not found" });
  }

  res.json({
    success: true,
    data: item,
  });
});

export const createItem = asyncHandler(async (req: Request, res: Response) => {
  const { name, sku, unit, category, reorderThreshold } = req.body;

  // Check if SKU already exists
  const existingItem = await prisma.item.findUnique({
    where: { sku },
  });

  if (existingItem) {
    return res.status(400).json({ message: "SKU already exists" });
  }

  const item = await prisma.item.create({
    data: {
      name,
      sku,
      unit,
      category,
      reorderThreshold: reorderThreshold ? parseInt(reorderThreshold) : 0,
    },
  });

  // Log action in AuditLog
  await prisma.auditLog.create({
    data: {
      userId: (req as any).user.id,
      action: "CREATE",
      entityType: "Item",
      entityId: item.id,
      newValue: item as any,
    },
  });

  res.status(201).json({
    success: true,
    data: item,
  });
});

export const updateItem = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { name, sku, unit, category, reorderThreshold } = req.body;

  const oldItem = await prisma.item.findUnique({
    where: { id: parseInt(id) },
  });

  if (!oldItem) {
    return res.status(404).json({ message: "Item not found" });
  }

  // Check if new SKU already exists (if SKU is being changed)
  if (sku && sku !== oldItem.sku) {
    const existingItem = await prisma.item.findUnique({
      where: { sku },
    });

    if (existingItem) {
      return res.status(400).json({ message: "SKU already exists" });
    }
  }

  const item = await prisma.item.update({
    where: { id: parseInt(id) },
    data: {
      name,
      sku,
      unit,
      category,
      reorderThreshold:
        reorderThreshold !== undefined ? parseInt(reorderThreshold) : undefined,
    },
  });

  // Log action in AuditLog
  await prisma.auditLog.create({
    data: {
      userId: (req as any).user.id,
      action: "UPDATE",
      entityType: "Item",
      entityId: item.id,
      oldValue: oldItem as any,
      newValue: item as any,
    },
  });

  res.json({
    success: true,
    data: item,
  });
});

export const deleteItem = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const item = await prisma.item.findUnique({
    where: { id: parseInt(id) },
  });

  if (!item) {
    return res.status(404).json({ message: "Item not found" });
  }

  // Check if item has inventory or is used in PRs/POs/SOs
  const inventoryCount = await prisma.inventory.count({
    where: { itemId: parseInt(id) },
  });

  if (inventoryCount > 0) {
    return res
      .status(400)
      .json({ message: "Cannot delete item with existing inventory" });
  }

  await prisma.item.delete({
    where: { id: parseInt(id) },
  });

  // Log action in AuditLog
  await prisma.auditLog.create({
    data: {
      userId: (req as any).user.id,
      action: "DELETE",
      entityType: "Item",
      entityId: parseInt(id),
      oldValue: item as any,
    },
  });

  res.json({
    success: true,
    message: "Item deleted successfully",
  });
});
