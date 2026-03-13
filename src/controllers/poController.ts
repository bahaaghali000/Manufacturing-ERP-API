import { Request, Response } from "express";
import { prisma } from "../config/db";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthRequest } from "../middleware/auth";

export const getPOs = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const status = req.query.status as string;
  const vendorId = req.query.vendorId as string;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (status) where.status = status;
  if (vendorId) where.vendorId = parseInt(vendorId);

  const [pos, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      skip,
      take: limit,
      include: {
        vendor: {
          select: {
            name: true,
          },
        },
        createdBy: {
          select: {
            name: true,
          },
        },
        _count: {
          select: {
            lineItems: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.purchaseOrder.count({ where }),
  ]);

  res.json({
    success: true,
    data: pos,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

export const getPOById = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: parseInt(id) },
    include: {
      lineItems: {
        include: {
          item: true,
        },
      },
      vendor: true,
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      approvedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      pr: {
        include: {
          department: true,
        },
      },
    },
  });

  if (!po) {
    return res.status(404).json({ message: "Purchase Order not found" });
  }

  res.json({
    success: true,
    data: po,
  });
});

export const createPO = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { vendorId, lineItems, prId } = req.body;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
    return res.status(400).json({ message: "PO must have at least one line item" });
  }

  // Calculate total amount
  let totalAmount = 0;
  for (const item of lineItems) {
    totalAmount += Number(item.quantityOrdered) * Number(item.unitPrice);
  }

  const po = await prisma.$transaction(async (tx) => {
    const newPO = await tx.purchaseOrder.create({
      data: {
        vendorId: parseInt(vendorId),
        prId: prId ? parseInt(prId) : null,
        createdById: userId,
        status: "DRAFT",
        totalAmount: totalAmount,
        lineItems: {
          create: lineItems.map((item: any) => ({
            itemId: parseInt(item.itemId),
            quantityOrdered: parseInt(item.quantityOrdered),
            unitPrice: parseFloat(item.unitPrice),
            quantityReceived: 0,
          })),
        },
      },
      include: {
        lineItems: true,
        vendor: true,
      },
    });

    // If prId is provided, update the PR status
    if (prId) {
      await tx.purchaseRequisition.update({
        where: { id: parseInt(prId) },
        data: { status: "CONVERTED_TO_PO" },
      });
    }

    // Log action in AuditLog
    await tx.auditLog.create({
      data: {
        userId: userId,
        action: "CREATE",
        entityType: "PurchaseOrder",
        entityId: newPO.id,
        newValue: newPO as any,
      },
    });

    return newPO;
  });

  res.status(201).json({
    success: true,
    data: po,
  });
});

export const convertPRtoPO = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { prId, vendorId } = req.body;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const pr = await prisma.purchaseRequisition.findUnique({
    where: { id: parseInt(prId) },
    include: {
      lineItems: true,
    },
  });

  if (!pr) {
    return res.status(404).json({ message: "PR not found" });
  }

  if (pr.status !== "APPROVED") {
    return res.status(400).json({ message: "Only approved PRs can be converted to POs" });
  }

  const po = await prisma.$transaction(async (tx) => {
    const newPO = await tx.purchaseOrder.create({
      data: {
        vendorId: parseInt(vendorId),
        prId: pr.id,
        createdById: userId,
        status: "DRAFT",
        totalAmount: pr.totalAmount,
        lineItems: {
          create: pr.lineItems.map((item) => ({
            itemId: item.itemId,
            quantityOrdered: item.quantity,
            unitPrice: item.unitPrice,
            quantityReceived: 0,
          })),
        },
      },
      include: {
        lineItems: true,
        vendor: true,
      },
    });

    await tx.purchaseRequisition.update({
      where: { id: pr.id },
      data: { status: "CONVERTED_TO_PO" },
    });

    // Log action in AuditLog
    await tx.auditLog.create({
      data: {
        userId: userId,
        action: "CONVERT_PR_TO_PO",
        entityType: "PurchaseOrder",
        entityId: newPO.id,
        newValue: newPO as any,
      },
    });

    return newPO;
  });

  res.status(201).json({
    success: true,
    data: po,
  });
});

export const updatePOStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const { status } = req.body;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const validStatuses = [
    "DRAFT",
    "PENDING_APPROVAL",
    "APPROVED",
    "SENT",
    "PARTIALLY_RECEIVED",
    "FULLY_RECEIVED",
    "CANCELLED",
  ];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  const oldPO = await prisma.purchaseOrder.findUnique({
    where: { id: parseInt(id) },
  });

  if (!oldPO) {
    return res.status(404).json({ message: "Purchase Order not found" });
  }

  const data: any = { status };

  // If status is APPROVED, set approvedById
  if (status === "APPROVED") {
    data.approvedById = userId;
  }

  const updatedPO = await prisma.purchaseOrder.update({
    where: { id: parseInt(id) },
    data,
    include: {
      lineItems: true,
      vendor: true,
    },
  });

  // Log action in AuditLog
  await prisma.auditLog.create({
    data: {
      userId: userId,
      action: "UPDATE_STATUS",
      entityType: "PurchaseOrder",
      entityId: updatedPO.id,
      oldValue: { status: oldPO.status },
      newValue: { status: updatedPO.status },
    },
  });

  res.json({
    success: true,
    data: updatedPO,
  });
});

export const receiveGoods = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const { warehouseId, items } = req.body; // items: Array of { itemId, quantityReceived }
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: parseInt(id) },
    include: {
      lineItems: true,
    },
  });

  if (!po) {
    return res.status(404).json({ message: "Purchase Order not found" });
  }

  const validStatuses = ["APPROVED", "SENT", "PARTIALLY_RECEIVED"];
  if (!validStatuses.includes(po.status)) {
    return res.status(400).json({ message: `Cannot receive goods for PO in ${po.status} status` });
  }

  const result = await prisma.$transaction(async (tx) => {
    let allReceived = true;

    for (const item of items) {
      const poLineItem = po.lineItems.find((li) => li.itemId === parseInt(item.itemId));
      if (!poLineItem) continue;

      const newQuantityReceived = poLineItem.quantityReceived + parseInt(item.quantityReceived);
      
      // Update PO line item
      await tx.pOLineItem.update({
        where: { id: poLineItem.id },
        data: { quantityReceived: newQuantityReceived },
      });

      // Update Inventory
      const inventory = await tx.inventory.upsert({
        where: {
          itemId_warehouseId: {
            itemId: parseInt(item.itemId),
            warehouseId: parseInt(warehouseId),
          },
        },
        update: {
          quantityOnHand: { increment: parseInt(item.quantityReceived) },
        },
        create: {
          itemId: parseInt(item.itemId),
          warehouseId: parseInt(warehouseId),
          quantityOnHand: parseInt(item.quantityReceived),
        },
      });

      // Log action in AuditLog
      await tx.auditLog.create({
        data: {
          userId: userId,
          action: "RECEIVE_GOODS",
          entityType: "Inventory",
          entityId: inventory.id,
          newValue: { 
            poId: po.id, 
            itemId: item.itemId, 
            quantityReceived: item.quantityReceived,
            newTotal: inventory.quantityOnHand + parseInt(item.quantityReceived)
          },
        },
      });

      if (newQuantityReceived < poLineItem.quantityOrdered) {
        allReceived = false;
      }
    }

    // Check other line items not in the current receipt
    for (const li of po.lineItems) {
      const isBeingReceived = items.find((i: any) => parseInt(i.itemId) === li.itemId);
      if (!isBeingReceived && li.quantityReceived < li.quantityOrdered) {
        allReceived = false;
      }
    }

    const newStatus = allReceived ? "FULLY_RECEIVED" : "PARTIALLY_RECEIVED";
    
    const updatedPO = await tx.purchaseOrder.update({
      where: { id: po.id },
      data: { status: newStatus },
    });

    return updatedPO;
  });

  res.json({
    success: true,
    data: result,
  });
});
