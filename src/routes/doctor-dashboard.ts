// @ts-nocheck
import { Router } from "express";
import { db } from "../../db/src/index.js";
import { appointmentsTable, doctorsTable, slotsTable, usersTable } from "../../db/src/index.js";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/requireAuth.js";

const router: any = Router();

router.get("/doctor/dashboard", requireAuth, requireRole("doctor"), async (req: AuthRequest, res): Promise<void> => {
  const [doctor] = await db
    .select({
      doctor: {
        id: doctorsTable.id,
        userId: doctorsTable.userId,
        specialty: doctorsTable.specialty,
        price: doctorsTable.price,
        rating: doctorsTable.rating,
        reviewCount: doctorsTable.reviewCount,
        isOnline: doctorsTable.isOnline,
      },
      user: {
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
      }
    })
    .from(doctorsTable)
    .innerJoin(usersTable, eq(doctorsTable.userId, usersTable.id))
    .where(eq(doctorsTable.userId, req.userId!));

  if (!doctor) {
    res.status(404).json({ error: "Doctor profile not found" });
    return;
  }

  const allAppts = await db.select().from(appointmentsTable).where(eq(appointmentsTable.doctorId, doctor.doctor.id));

  const upcomingCount = allAppts.filter(a => a.status === "pending" || a.status === "confirmed").length;
  const completedCount = allAppts.filter(a => a.status === "completed").length;
  const pendingPaymentCount = allAppts.filter(a => !a.isPaid && a.status !== "cancelled").length;
  const totalEarnings = allAppts.filter(a => a.isPaid).length * doctor.doctor.price;

  const slotsForRecent = await db.select().from(slotsTable);
  const slotMap = new Map<number, typeof slotsTable.$inferSelect>(slotsForRecent.map(s => [s.id, s]));

  const sortedAppts = [...allAppts].sort((a, b) => {
    const aSlot = a.slotId != null ? slotMap.get(a.slotId) : undefined;
    const bSlot = b.slotId != null ? slotMap.get(b.slotId) : undefined;
    const aTime = aSlot ? (aSlot.startTime instanceof Date ? aSlot.startTime.getTime() : new Date(aSlot.startTime).getTime()) : (a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime());
    const bTime = bSlot ? (bSlot.startTime instanceof Date ? bSlot.startTime.getTime() : new Date(bSlot.startTime).getTime()) : (b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime());
    return bTime - aTime;
  });

  const recent = sortedAppts.slice(0, 10);

  const formatted = await Promise.all(recent.map(async (appt) => {
    const slot = appt.slotId != null ? slotMap.get(appt.slotId) : undefined;
    const [patient] = await db.select().from(usersTable).where(eq(usersTable.id, appt.patientId));

    return {
      id: appt.id,
      patientId: appt.patientId,
      doctorId: appt.doctorId,
      slotId: appt.slotId,
      status: appt.status,
      isPaid: appt.isPaid,
      paidAt: appt.paidAt instanceof Date ? appt.paidAt.toISOString() : (appt.paidAt ? new Date(appt.paidAt).toISOString() : null),
      notes: appt.notes,
      patientName: patient ? `${patient.firstName} ${patient.lastName}` : null,
      patientEmail: patient?.email ?? null,
      patientPhone: patient?.phone ?? null,
      doctorName: `${doctor.user.firstName} ${doctor.user.lastName}`,
      doctorSpecialty: doctor.doctor.specialty,
      doctorPrice: doctor.doctor.price,
      startTime: slot?.startTime instanceof Date ? slot.startTime.toISOString() : (slot?.startTime ? new Date(slot.startTime).toISOString() : null),
      endTime: slot?.endTime instanceof Date ? slot.endTime.toISOString() : (slot?.endTime ? new Date(slot.endTime).toISOString() : null),
      createdAt: appt.createdAt instanceof Date ? appt.createdAt.toISOString() : new Date(appt.createdAt).toISOString(),
    };
  }));

  res.json({
    upcomingCount,
    completedCount,
    pendingPaymentCount,
    totalEarnings,
    rating: doctor.doctor.rating,
    reviewCount: doctor.doctor.reviewCount,
    doctorName: `${doctor.user.firstName} ${doctor.user.lastName}`,
    specialty: doctor.doctor.specialty,
    recentAppointments: formatted,
  });
});

router.get("/doctor/profile", requireAuth, requireRole("doctor"), async (req: AuthRequest, res): Promise<void> => {
  const [row] = await db
    .select({
      doctor: {
        id: doctorsTable.id,
        userId: doctorsTable.userId,
        specialty: doctorsTable.specialty,
        type: doctorsTable.type,
        bio: doctorsTable.bio,
        isOnline: doctorsTable.isOnline,
        rating: doctorsTable.rating,
        reviewCount: doctorsTable.reviewCount,
        price: doctorsTable.price,
        yearsExperience: doctorsTable.yearsExperience,
        languages: doctorsTable.languages,
        gender: doctorsTable.gender,
        sessionType: doctorsTable.sessionType,
        isApproved: doctorsTable.isApproved,
        pendingBio: doctorsTable.pendingBio,
        pendingPrice: doctorsTable.pendingPrice,
        pendingSpecialty: doctorsTable.pendingSpecialty,
        pendingLanguages: doctorsTable.pendingLanguages,
        pendingGender: doctorsTable.pendingGender,
        paymentInfo: doctorsTable.paymentInfo,
        pendingPaymentInfo: doctorsTable.pendingPaymentInfo,
        avatarUrl: doctorsTable.avatarUrl,
        pendingAvatarUrl: doctorsTable.pendingAvatarUrl,
        isRejected: doctorsTable.isRejected,
        rejectionReason: doctorsTable.rejectionReason,
      },
      user: {
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
      }
    })
    .from(doctorsTable)
    .innerJoin(usersTable, eq(doctorsTable.userId, usersTable.id))
    .where(eq(doctorsTable.userId, req.userId!));

  if (!row) {
    res.status(404).json({ error: "Doctor profile not found" });
    return;
  }

  res.json({
    id: row.doctor.id,
    userId: row.doctor.userId,
    firstName: row.user.firstName,
    lastName: row.user.lastName,
    name: `${row.user.firstName} ${row.user.lastName}`,
    email: row.user.email,
    specialty: row.doctor.specialty,
    type: row.doctor.type,
    bio: row.doctor.bio,
    isOnline: row.doctor.isOnline,
    rating: row.doctor.rating,
    reviewCount: row.doctor.reviewCount,
    price: row.doctor.price,
    yearsExperience: row.doctor.yearsExperience,
    languages: row.doctor.languages,
    gender: row.doctor.gender,
    sessionType: row.doctor.sessionType,
    isApproved: row.doctor.isApproved,
    pendingBio: row.doctor.pendingBio,
    pendingPrice: row.doctor.pendingPrice,
    pendingSpecialty: row.doctor.pendingSpecialty,
    pendingLanguages: row.doctor.pendingLanguages,
    pendingGender: row.doctor.pendingGender,
    paymentInfo: row.doctor.paymentInfo,
    pendingPaymentInfo: row.doctor.pendingPaymentInfo,
    avatarUrl: row.doctor.avatarUrl,
    pendingAvatarUrl: row.doctor.pendingAvatarUrl,
    isRejected: row.doctor.isRejected,
    rejectionReason: row.doctor.rejectionReason,
  });
});

router.patch("/doctor/profile", requireAuth, requireRole("doctor"), async (req: AuthRequest, res): Promise<void> => {
  const { bio, isOnline, price, specialty, languages, gender, paymentInfo, sessionType, yearsExperience, avatarUrl } = req.body ?? {};

  const [doctor] = await db.select().from(doctorsTable).where(eq(doctorsTable.userId, req.userId!));
  if (!doctor) {
    res.status(404).json({ error: "Doctor profile not found" });
    return;
  }

  const updates: Partial<typeof doctorsTable.$inferInsert> = {};
  
  // Non-critical fields - update directly
  if (typeof isOnline === "boolean") updates.isOnline = isOnline;
  if (typeof sessionType === "string") updates.sessionType = sessionType;
  if (typeof yearsExperience === "number") updates.yearsExperience = yearsExperience;

  // Critical fields - handle based on approval status
  if (doctor.isApproved) {
    // If already approved, save changes to pending fields
    if (typeof bio === "string") updates.pendingBio = bio;
    if (typeof price === "number") {
      updates.pendingPrice = price;
      updates.priceChangedByAdmin = false;
    }
    if (Array.isArray(specialty)) updates.pendingSpecialty = specialty;
    if (Array.isArray(languages)) updates.pendingLanguages = languages;
    if (typeof gender === "string") updates.pendingGender = gender;
    if (typeof paymentInfo === "string") updates.pendingPaymentInfo = paymentInfo;
    if (typeof avatarUrl === "string") updates.pendingAvatarUrl = avatarUrl;
  } else {
    // If not yet approved (newly registered), update directly
    if (typeof bio === "string") updates.bio = bio;
    if (typeof price === "number") {
      updates.price = price;
      updates.priceChangedByAdmin = false;
    }
    if (Array.isArray(specialty)) updates.specialty = specialty;
    if (Array.isArray(languages)) updates.languages = languages;
    if (typeof gender === "string") updates.gender = gender;
    if (typeof paymentInfo === "string") updates.paymentInfo = paymentInfo;
    if (typeof avatarUrl === "string") updates.avatarUrl = avatarUrl;
    
    // Also clear pending fields if any (unlikely here but good practice)
    updates.pendingBio = null;
    updates.pendingPrice = null;
    updates.pendingSpecialty = null;
    updates.pendingLanguages = null;
    updates.pendingGender = null;
    updates.pendingPaymentInfo = null;
    updates.pendingAvatarUrl = null;
    
    // Clear rejection status if they are resubmitting while not yet approved
    updates.isRejected = false;
    updates.rejectionReason = null;
  }
  
  // Also clear rejection status if they are resubmitting while already approved
  if (doctor.isApproved) {
    updates.isRejected = false;
    updates.rejectionReason = null;
  }

  const [updated] = await db
    .update(doctorsTable)
    .set(updates)
    .where(eq(doctorsTable.id, doctor.id))
    .returning();

  res.json({ 
    success: true, 
    isOnline: updated.isOnline, 
    bio: updated.bio,
    avatarUrl: updated.avatarUrl,
    hasPendingChanges: !!(updated.pendingBio || updated.pendingPrice || updated.pendingSpecialty || updated.pendingLanguages || updated.pendingGender || updated.pendingAvatarUrl)
  });
});

export default router;
