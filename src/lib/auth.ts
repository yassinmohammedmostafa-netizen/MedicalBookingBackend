// @ts-nocheck
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.SESSION_SECRET ?? "esaal-secret-key";
const JWT_EXPIRES_IN = "7d";

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: { userId: number; role: string; passwordHash: string }): string {
  // We only include a portion of the hash to keep the token small 
  // but enough to detect changes.
  const hashVersion = payload.passwordHash.slice(-10);
  return jwt.sign({ ...payload, passwordHash: hashVersion }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): { userId: number; role: string; passwordHash: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: number; role: string; passwordHash: string };
  } catch {
    return null;
  }
}
