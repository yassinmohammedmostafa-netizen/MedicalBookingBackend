// @ts-nocheck
import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/auth.js";

export interface AuthRequest extends Request {
  userId?: number;
  userRole?: string;
}

import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = header.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  // Check database to ensure user exists and password hasn't changed
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId));
  
  if (!user) {
    res.status(401).json({ error: "Account no longer exists" });
    return;
  }

  // Verify password hash version (last 10 chars)
  const currentHashVersion = user.passwordHash.slice(-10);
  if (payload.passwordHash !== currentHashVersion) {
    res.status(401).json({ error: "Session invalidated (password changed)" });
    return;
  }

  req.userId = payload.userId;
  req.userRole = payload.role;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
