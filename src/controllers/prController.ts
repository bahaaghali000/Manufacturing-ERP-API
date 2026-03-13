import { Request, Response } from "express";
import { prisma } from "../config/db";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthRequest } from "../middleware/auth";

export const createPR = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { lineItems, departmentId } = req.body;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
    return res.status(400).json({ message: "PR must have at least one line item" });
  }

  // Calculate total amount
  let totalAmount = 0;
  for (const item of lineItems) {
    totalAmount += Number(item.quantity) * Number(item.unitPrice);
  }

  // Create PR with line items in a transaction
  const pr = await prisma.$transaction(async (tx) => {
    const newPR = await tx.purchaseRequisition.create({
      data: {
        createdById: userId,
        departmentId: parseInt(departmentId),
        status: "SUBMITTED",
        totalAmount: totalAmount,
        lineItems: {
          create: lineItems.map((item: any) => ({
            itemId: parseInt(item.itemId),
            quantity: parseInt(item.quantity),
            unitPrice: parseFloat(item.unitPrice),
            notes: item.notes,
          })),
        },
      },
      include: {
        lineItems: {
          include: {
            item: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        department: true,
      },
    });

    // Log action in AuditLog
    await tx.auditLog.create({
      data: {
        userId: userId,
        action: "CREATE",
        entityType: "PurchaseRequisition",
        entityId: newPR.id,
        newValue: newPR as any,
      },
    });

    return newPR;
  });

  res.status(201).json({
    success: true,
    data: pr,
  });
});

export const getPRs = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const status = req.query.status as string;
  const departmentId = req.query.departmentId as string;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (status) where.status = status;
  if (departmentId) where.departmentId = parseInt(departmentId);

  const [prs, total] = await Promise.all([
    prisma.purchaseRequisition.findMany({
      where,
      skip,
      take: limit,
      include: {
        createdBy: {
          select: {
            name: true,
          },
        },
        department: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.purchaseRequisition.count({ where }),
  ]);

  res.json({
    success: true,
    data: prs,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

export const getPRById = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const pr = await prisma.purchaseRequisition.findUnique({
    where: { id: parseInt(id) },
    include: {
      lineItems: {
        include: {
          item: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      department: true,
    },
  });

  if (!pr) {
    return res.status(404).json({ message: "Purchase Requisition not found" });
  }

  res.json({
    success: true,
    data: pr,
  });
});

export const updatePRStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const { status } = req.body;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const validStatuses = ["SUBMITTED", "APPROVED", "REJECTED"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  const oldPR = await prisma.purchaseRequisition.findUnique({
    where: { id: parseInt(id) },
  });

  if (!oldPR) {
    return res.status(404).json({ message: "Purchase Requisition not found" });
  }

  const updatedPR = await prisma.purchaseRequisition.update({
    where: { id: parseInt(id) },
    data: { status },
    include: {
      lineItems: {
        include: {
          item: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      department: true,
    },
  });

  // Log action in AuditLog
  await prisma.auditLog.create({
    data: {
      userId: userId,
      action: "UPDATE_STATUS",
      entityType: "PurchaseRequisition",
      entityId: updatedPR.id,
      oldValue: { status: oldPR.status },
      newValue: { status: updatedPR.status },
    },
  });

  res.json({
    success: true,
    data: updatedPR,
  });
});
