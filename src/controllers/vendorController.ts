import { Request, Response } from "express";
import { prisma } from "../config/db";
import { asyncHandler } from "../utils/asyncHandler";
import { VendorStatus } from "@prisma/client";

export const getVendors = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const search = (req.query.search as string) || "";
  const skip = (page - 1) * limit;

  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { contactEmail: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [vendors, total] = await Promise.all([
    prisma.vendor.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.vendor.count({ where }),
  ]);

  res.json({
    success: true,
    data: vendors,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

export const getVendorById = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const vendor = await prisma.vendor.findUnique({
    where: { id: parseInt(id) },
    include: {
      purchaseOrders: {
        take: 5,
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!vendor) {
    return res.status(404).json({ message: "Vendor not found" });
  }

  res.json({
    success: true,
    data: vendor,
  });
});

export const createVendor = asyncHandler(async (req: Request, res: Response) => {
  const { name, contactEmail, phone, address, status } = req.body;

  const vendor = await prisma.vendor.create({
    data: {
      name,
      contactEmail,
      phone,
      address,
      status: status || VendorStatus.ACTIVE,
    },
  });

  // Log action in AuditLog
  await prisma.auditLog.create({
    data: {
      userId: (req as any).user.id,
      action: "CREATE",
      entityType: "Vendor",
      entityId: vendor.id,
      newValue: vendor as any,
    },
  });

  res.status(201).json({
    success: true,
    data: vendor,
  });
});

export const updateVendor = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { name, contactEmail, phone, address, status } = req.body;

  const oldVendor = await prisma.vendor.findUnique({
    where: { id: parseInt(id) },
  });

  if (!oldVendor) {
    return res.status(404).json({ message: "Vendor not found" });
  }

  const vendor = await prisma.vendor.update({
    where: { id: parseInt(id) },
    data: {
      name,
      contactEmail,
      phone,
      address,
      status,
    },
  });

  // Log action in AuditLog
  await prisma.auditLog.create({
    data: {
      userId: (req as any).user.id,
      action: "UPDATE",
      entityType: "Vendor",
      entityId: vendor.id,
      oldValue: oldVendor as any,
      newValue: vendor as any,
    },
  });

  res.json({
    success: true,
    data: vendor,
  });
});

export const deleteVendor = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const vendor = await prisma.vendor.findUnique({
    where: { id: parseInt(id) },
  });

  if (!vendor) {
    return res.status(404).json({ message: "Vendor not found" });
  }

  // Check if vendor has purchase orders
  const poCount = await prisma.purchaseOrder.count({
    where: { vendorId: parseInt(id) },
  });

  if (poCount > 0) {
    return res
      .status(400)
      .json({ message: "Cannot delete vendor with associated purchase orders" });
  }

  await prisma.vendor.delete({
    where: { id: parseInt(id) },
  });

  // Log action in AuditLog
  await prisma.auditLog.create({
    data: {
      userId: (req as any).user.id,
      action: "DELETE",
      entityType: "Vendor",
      entityId: parseInt(id),
      oldValue: vendor as any,
    },
  });

  res.json({
    success: true,
    message: "Vendor deleted successfully",
  });
});
