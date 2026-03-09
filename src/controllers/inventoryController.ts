import { Request, Response } from "express";
import { prisma } from "../config/db";
import { asyncHandler } from "../utils/asyncHandler";

export const getInventory = asyncHandler(
  async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            {
              warehouse: {
                name: { contains: search, mode: "insensitive" as const },
              },
            },
            {
              item: {
                name: { contains: search, mode: "insensitive" as const },
              },
            },
          ],
        }
      : {};

    const [inventory, total] = await Promise.all([
      prisma.inventory.findMany({
        include: {
          item: {
            select: {
              name: true,
              sku: true,
              id: true,
            },
          },
          warehouse: {
            select: {
              name: true,
              id: true,
            },
          },
        },
        orderBy: { item: { name: "asc" } },
        where,
        skip,
        take: limit,
      }),
      prisma.inventory.count({ where }),
    ]);

    res.json({
      success: true,
      data: inventory,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  },
);

export const getLowStock = asyncHandler(async (req: Request, res: Response) => {
  const inventory = await prisma.inventory.findMany({
    include: {
      item: true,
      warehouse: true,
    },
    // Filter items where quantityOnHand <= reorderThreshold
  });

  const lowStock = inventory.filter(
    (inv) => inv.quantityOnHand <= inv.item.reorderThreshold,
  );

  res.json({
    success: true,
    data: lowStock,
    count: lowStock.length,
  });
});

export const getWarehouses = asyncHandler(
  async (req: Request, res: Response) => {
    const warehouses = await prisma.warehouse.findMany({
      orderBy: { name: "asc" },
    });

    res.json({
      success: true,
      data: warehouses,
    });
  },
);

export const adjustInventory = asyncHandler(
  async (req: Request, res: Response) => {
    const { itemId, warehouseId, quantityChange, reason } = req.body;

    if (!itemId || !warehouseId || quantityChange === undefined) {
      return res.status(400).json({
        message: "Item ID, Warehouse ID, and quantity change are required",
      });
    }

    // Find or create inventory record
    const inventory = await prisma.inventory.upsert({
      where: {
        itemId_warehouseId: {
          itemId: parseInt(itemId),
          warehouseId: parseInt(warehouseId),
        },
      },
      update: {
        quantityOnHand: {
          increment: parseInt(quantityChange),
        },
      },
      create: {
        itemId: parseInt(itemId),
        warehouseId: parseInt(warehouseId),
        quantityOnHand: parseInt(quantityChange),
      },
    });

    // Log in AuditLog
    await prisma.auditLog.create({
      data: {
        userId: (req as any).user.id,
        action: "ADJUST_INVENTORY",
        entityType: "Inventory",
        entityId: inventory.id,
        newValue: {
          itemId,
          warehouseId,
          quantityChange,
          newQuantity: inventory.quantityOnHand,
          reason,
        } as any,
      },
    });

    res.json({
      success: true,
      data: inventory,
    });
  },
);
