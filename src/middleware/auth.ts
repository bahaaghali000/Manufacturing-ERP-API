import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../config/db";

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-erp-key-2026";

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: string;
    permissions: any;
  };
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    // Fetch full user and role to ensure permissions are up to date
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: { role: true },
    });

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role.name,
      permissions: user.role.permissions,
    };

    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

export const authorize = (requiredPermission: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const { role, permissions } = req.user;

    // Admin has all permissions
    if (role === "Admin" || (permissions && permissions.all)) {
      return next();
    }

    // Check if the specific permission exists
    if (permissions && permissions[requiredPermission]) {
      return next();
    }

    return res
      .status(403)
      .json({ message: "Forbidden: Insufficient permissions" });
  };
};
