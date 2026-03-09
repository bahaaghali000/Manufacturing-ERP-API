import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../config/db";
import { asyncHandler } from "../utils/asyncHandler";

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-erp-key-2026";
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || "super-secret-refresh-key-2026";

const generateAccessToken = (user: { id: number; email: string; role: { name: string } }) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role.name },
    JWT_SECRET,
    { expiresIn: "15m" }, // Access token is short-lived
  );
};

const generateRefreshToken = (user: { id: number; email: string }) => {
  return jwt.sign(
    { id: user.id, email: user.email },
    REFRESH_TOKEN_SECRET,
    { expiresIn: "7d" }, // Refresh token is longer-lived
  );
};

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({
    where: { email },
    include: { role: true, department: true },
  });

  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);

  if (!isValidPassword) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const accessToken = generateAccessToken(user);
  const refreshTokenString = generateRefreshToken(user);

  // Save refresh token to database
  await prisma.refreshToken.create({
    data: {
      token: refreshTokenString,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });

  res.json({
    success: true,
    data: {
      accessToken,
      refreshToken: refreshTokenString,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role.name,
        department: user.department?.name,
      },
    },
  });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ message: "Refresh token is required" });
  }

  // 1. Verify token signature - if this fails, jwt.verify throws and asyncHandler catches it
  const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET) as any;

  // 2. Check if token exists in DB and is not revoked
  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { user: { include: { role: true, department: true } } },
  });

  if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
    // If reuse detected or invalid, potentially revoke all tokens for this user for safety
    if (storedToken) {
      await prisma.refreshToken.updateMany({
        where: { userId: storedToken.userId },
        data: { revokedAt: new Date() },
      });
    }
    return res.status(401).json({ message: "Invalid or expired refresh token" });
  }

  // 3. Issue new tokens
  const accessToken = generateAccessToken(storedToken.user);
  const newRefreshTokenString = generateRefreshToken(storedToken.user);

  // 4. Update the DB: delete old, save new (Rotation)
  await prisma.$transaction([
    prisma.refreshToken.delete({ where: { id: storedToken.id } }),
    prisma.refreshToken.create({
      data: {
        token: newRefreshTokenString,
        userId: storedToken.userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    }),
  ]);

  res.json({
    success: true,
    data: {
      accessToken,
      refreshToken: newRefreshTokenString,
    },
  });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  if (refreshToken) {
    await prisma.refreshToken.deleteMany({
      where: { token: refreshToken },
    });
  }

  res.json({ success: true, message: "Logged out successfully" });
});

export const getMe = asyncHandler(async (req: any, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  res.json({
    success: true,
    data: req.user,
  });
});
