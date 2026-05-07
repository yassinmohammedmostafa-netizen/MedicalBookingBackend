// @ts-nocheck
import { Router } from "express";
import { db } from "../../db/src/index.js";
import { usersTable, doctorsTable, passwordResetTokensTable } from "../../db/src/index.js";
import { eq, and, gt } from "drizzle-orm";
import { hashPassword, comparePassword, signToken } from "../lib/auth.js";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/requireAuth.js";
import {
  RegisterUserBody,
  LoginUserBody,
} from "../../zod/src/index.js";
import { randomBytes } from "crypto";
import { sendPasswordResetEmail } from "../lib/email.js";

const router: any = Router();

function userResponse(user: typeof usersTable.$inferSelect, doctor?: typeof doctorsTable.$inferSelect) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    name: `${user.firstName} ${user.lastName}`,
    email: user.email,
    phone: user.phone,
    role: user.role,
    preferredLang: user.preferredLang,
    isEmailVerified: user.isEmailVerified,
    isApproved: doctor ? doctor.isApproved : (user.role === "admin" ? true : (user.role === "patient" ? true : false)),
    avatarUrl: doctor ? doctor.avatarUrl : null,
    createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : new Date().toISOString(),
  };
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { firstName, lastName, email, password, phone } = parsed.data;
  const lowercaseEmail = email.trim().toLowerCase();

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, lowercaseEmail));
  if (existing) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const emailVerificationToken = randomBytes(32).toString("hex");

  const [user] = await db.insert(usersTable).values({
    firstName,
    lastName,
    email: lowercaseEmail,
    passwordHash,
    phone: phone ?? null,
    role: "patient",
    emailVerificationToken,
  }).returning();

  try {
    const { sendEmailVerificationEmail } = await import("../lib/email.js");
    await sendEmailVerificationEmail(user.email, emailVerificationToken);
    console.log(`[AUTH] Verification email sent to ${user.email}`);
  } catch (err) {
    console.error(`[AUTH] Failed to send verification email to ${user.email}:`, err);
  }

  const token = signToken({ userId: user.id, role: user.role, passwordHash: user.passwordHash });
  res.status(201).json({ user: userResponse(user), token });
});

router.post("/auth/register-doctor", async (req, res): Promise<void> => {
  const { firstName, lastName, email, password, phone, specialty, type, gender, price, bio, yearsExperience, languages, sessionType, paymentInfo } = req.body ?? {};

  if (!firstName || !lastName || !email || !password || !phone || !specialty || !type || !gender || price == null) {
    res.status(400).json({ error: "Missing required fields: firstName, lastName, email, password, phone, specialty, type, gender, price" });
    return;
  }

  const lowercaseEmail = email.trim().toLowerCase();
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, lowercaseEmail));
  if (existing) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const emailVerificationToken = randomBytes(32).toString("hex");

  const [user] = await db.insert(usersTable).values({
    firstName,
    lastName,
    email: lowercaseEmail,
    passwordHash,
    phone: phone ?? null,
    role: "doctor",
    emailVerificationToken,
  }).returning();

  await db.insert(doctorsTable).values({
    userId: user.id,
    specialty,
    type,
    gender,
    price,
    bio: bio ?? null,
    yearsExperience: yearsExperience ?? null,
    languages: languages ?? ["Arabic"],
    sessionType: sessionType ?? "individual",
    paymentInfo: paymentInfo ?? null,
    isOnline: false,
    immediateAvailable: false,
    freeConsultation: false,
    rating: 0,
    reviewCount: 0,
    isApproved: false,
  });

  try {
    const { sendEmailVerificationEmail } = await import("../lib/email.js");
    await sendEmailVerificationEmail(user.email, emailVerificationToken);
    console.log(`[AUTH] Verification email sent to ${user.email}`);
  } catch (err) {
    console.error(`[AUTH] Failed to send verification email to ${user.email}:`, err);
  }

  const token = signToken({ userId: user.id, role: user.role, passwordHash: user.passwordHash });
  res.status(201).json({ user: userResponse(user), token });
});

router.get(["/auth/verify-email", "/verify-email"], async (req, res): Promise<void> => {
  const { token } = req.query;
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "Token is required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.emailVerificationToken, token));
  if (!user) {
    res.status(400).json({ error: "Invalid or expired verification token" });
    return;
  }

  await db.update(usersTable)
    .set({ isEmailVerified: true, emailVerificationToken: null })
    .where(eq(usersTable.id, user.id));

  const appUrl = process.env.APP_URL || "https://medical-booking-hub.vercel.app";
  res.redirect(`${appUrl}/login?verified=true`);
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;
  const lowercaseEmail = email.trim().toLowerCase();

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, lowercaseEmail));
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  if (!user.isEmailVerified) {
    res.status(403).json({ error: "Please verify your email address before logging in. Check your inbox for the verification link." });
    return;
  }

  if (user.role === "doctor") {
    const [doctor] = await db.select().from(doctorsTable).where(eq(doctorsTable.userId, user.id));
    if (!doctor) {
      res.status(403).json({ error: "Doctor profile not found." });
      return;
    }
    // We allow login even if not approved so they can see their dashboard/status
    const token = signToken({ userId: user.id, role: user.role, passwordHash: user.passwordHash });
    res.json({ user: userResponse(user, doctor), token });
    return;
  }

  const token = signToken({ userId: user.id, role: user.role, passwordHash: user.passwordHash });

  res.json({ user: userResponse(user), token });
});

router.post("/auth/change-password", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { currentPassword, newPassword } = req.body ?? {};

  if (!currentPassword || typeof currentPassword !== "string") {
    res.status(400).json({ error: "currentPassword is required" });
    return;
  }

  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
    res.status(400).json({ error: "newPassword must be at least 8 characters" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const valid = await comparePassword(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const passwordHash = await hashPassword(newPassword);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, req.userId!));

  res.json({ success: true });
});

router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const { email } = req.body ?? {};

  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "email is required" });
    return;
  }

  const lowercaseEmail = email.trim().toLowerCase();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, lowercaseEmail));

  if (!user) {
    res.json({ 
      message: "If an account exists with that email, a reset code has been sent.",
    });
    return;
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await db.insert(passwordResetTokensTable).values({
    userId: user.id,
    token: code,
    expiresAt,
  });

  try {
    await sendPasswordResetEmail(user.email, code);
    res.json({ success: true });
  } catch (err) {
    console.error("[PASSWORD RESET] Email delivery failed for user:", user.id, err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Failed to send reset email. Please try again later." });
  }
});

router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const { token, newPassword } = req.body ?? {};

  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "token is required" });
    return;
  }

  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
    res.status(400).json({ error: "newPassword must be at least 8 characters" });
    return;
  }

  const now = new Date();
  const [resetToken] = await db
    .select()
    .from(passwordResetTokensTable)
    .where(
      and(
        eq(passwordResetTokensTable.token, token),
        gt(passwordResetTokensTable.expiresAt, now)
      )
    );

  if (!resetToken) {
    res.status(400).json({ error: "Invalid or expired reset token" });
    return;
  }

  if (resetToken.usedAt) {
    res.status(400).json({ error: "This reset link has already been used" });
    return;
  }

  const passwordHash = await hashPassword(newPassword);

  await db
    .update(usersTable)
    .set({ passwordHash })
    .where(eq(usersTable.id, resetToken.userId));

  await db
    .update(passwordResetTokensTable)
    .set({ usedAt: now })
    .where(eq(passwordResetTokensTable.id, resetToken.id));

  res.json({ success: true });
});

router.post("/auth/logout", (_req, res): void => {
  res.json({ success: true });
});

router.get("/auth/me", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  
  let doctor;
  if (user.role === "doctor") {
    [doctor] = await db.select().from(doctorsTable).where(eq(doctorsTable.userId, user.id));
  }
  
  res.json(userResponse(user, doctor));
});

router.patch("/auth/profile", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { preferredLang, firstName, lastName, phone } = req.body ?? {};

  if (preferredLang !== undefined && !["en", "ar"].includes(preferredLang)) {
    res.status(400).json({ error: "preferredLang must be 'en' or 'ar'" });
    return;
  }

  if (firstName !== undefined && (typeof firstName !== "string" || firstName.trim().length === 0)) {
    res.status(400).json({ error: "firstName must be a non-empty string" });
    return;
  }

  if (lastName !== undefined && (typeof lastName !== "string" || lastName.trim().length === 0)) {
    res.status(400).json({ error: "lastName must be a non-empty string" });
    return;
  }

  if (phone !== undefined && phone !== null && typeof phone !== "string") {
    res.status(400).json({ error: "phone must be a string" });
    return;
  }

  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (preferredLang !== undefined) updates.preferredLang = preferredLang;
  if (firstName !== undefined) updates.firstName = firstName.trim();
  if (lastName !== undefined) updates.lastName = lastName.trim();
  if (phone !== undefined) updates.phone = phone.trim() === "" ? null : phone.trim();

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, req.userId!))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(userResponse(updated));
});

export default router;
