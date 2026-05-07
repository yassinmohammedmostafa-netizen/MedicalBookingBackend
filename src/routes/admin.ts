// @ts-nocheck
import { Router } from "express";
import { db } from "../../db/src/index.js";
import { appointmentsTable, doctorsTable, usersTable, slotsTable } from "../../db/src/index.js";
import { eq, count, ne, sql } from "drizzle-orm";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/requireAuth.js";
import { CreateAdminUserBody } from "../../zod/src/index.js";
import { hashPassword } from "../lib/auth.js";

const router: any = Router();

router.get("/admin/appointments", requireAuth, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
  const { doctorName, patientName, date } = req.query;
  
  const appointments = await db.select().from(appointmentsTable);

  let formatted = await Promise.all(appointments.map(async (appt) => {
    const slot = appt.slotId
      ? (await db.select().from(slotsTable).where(eq(slotsTable.id, appt.slotId)))[0]
      : undefined;
    const [patient] = await db.select().from(usersTable).where(eq(usersTable.id, appt.patientId));
    const [doctorRow] = await db
      .select({
        doctor: {
          id: doctorsTable.id,
          specialty: doctorsTable.specialty,
          price: doctorsTable.price,
        },
        user: {
          firstName: usersTable.firstName,
          lastName: usersTable.lastName,
        }
      })
      .from(doctorsTable)
      .innerJoin(usersTable, eq(doctorsTable.userId, usersTable.id))
      .where(eq(doctorsTable.id, appt.doctorId));

    const startTime = (slot?.startTime instanceof Date ? slot.startTime.toISOString() : (slot?.startTime ? new Date(slot.startTime).toISOString() : (appt.createdAt instanceof Date ? appt.createdAt.toISOString() : new Date(appt.createdAt).toISOString())));
    const endTime = slot?.endTime instanceof Date ? slot.endTime.toISOString() : (slot?.endTime ? new Date(slot.endTime).toISOString() : null);

    return {
      id: appt.id,
      patientId: appt.patientId,
      doctorId: appt.doctorId,
      slotId: appt.slotId ?? null,
      isInstant: appt.slotId == null,
      status: appt.status,
      isPaid: appt.isPaid,
      paidAt: appt.paidAt instanceof Date ? appt.paidAt.toISOString() : (appt.paidAt ? new Date(appt.paidAt).toISOString() : null),
      notes: appt.notes,
      patientName: patient ? `${patient.firstName} ${patient.lastName}` : null,
      patientEmail: patient?.email ?? null,
      patientPhone: patient?.phone ?? null,
      doctorName: doctorRow ? `${doctorRow.user.firstName} ${doctorRow.user.lastName}` : null,
      doctorSpecialty: doctorRow?.doctor.specialty ?? null,
      doctorPrice: doctorRow?.doctor.price ?? null,
      startTime,
      endTime,
      createdAt: appt.createdAt instanceof Date ? appt.createdAt.toISOString() : new Date(appt.createdAt).toISOString(),
    };
  }));

  // Client-side filtering for simplicity given the current structure
  if (doctorName) {
    const q = (doctorName as string).toLowerCase();
    formatted = formatted.filter(a => a.doctorName?.toLowerCase().includes(q));
  }
  if (patientName) {
    const q = (patientName as string).toLowerCase();
    formatted = formatted.filter(a => a.patientName?.toLowerCase().includes(q));
  }
  if (date) {
    const d = (date as string); // Expected YYYY-MM-DD
    formatted = formatted.filter(a => a.startTime?.startsWith(d));
  }

  res.json(formatted);
});

router.get("/admin/doctors", requireAuth, requireRole("admin"), async (_req: AuthRequest, res): Promise<void> => {
  const doctors = await db
    .select({
      id: doctorsTable.id,
      userId: doctorsTable.userId,
      specialty: doctorsTable.specialty,
      subspecialty: doctorsTable.subspecialty,
      type: doctorsTable.type,
      sessionType: doctorsTable.sessionType,
      gender: doctorsTable.gender,
      price: doctorsTable.price,
      rating: doctorsTable.rating,
      reviewCount: doctorsTable.reviewCount,
      bio: doctorsTable.bio,
      isOnline: doctorsTable.isOnline,
      immediateAvailable: doctorsTable.immediateAvailable,
      freeConsultation: doctorsTable.freeConsultation,
      yearsExperience: doctorsTable.yearsExperience,
      languages: doctorsTable.languages,
      avatarUrl: doctorsTable.avatarUrl,
      isApproved: doctorsTable.isApproved,
      pendingBio: doctorsTable.pendingBio,
      pendingPrice: doctorsTable.pendingPrice,
      pendingSpecialty: doctorsTable.pendingSpecialty,
      pendingLanguages: doctorsTable.pendingLanguages,
      pendingGender: doctorsTable.pendingGender,
      paymentInfo: doctorsTable.paymentInfo,
      pendingPaymentInfo: doctorsTable.pendingPaymentInfo,
      isRejected: doctorsTable.isRejected,
      rejectionReason: doctorsTable.rejectionReason,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
    })
    .from(doctorsTable)
    .innerJoin(usersTable, eq(doctorsTable.userId, usersTable.id));

  res.json(doctors);
});

router.patch("/admin/doctors/:id/approve-changes", requireAuth, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid doctor id" });
    return;
  }

  const [doctor] = await db.select().from(doctorsTable).where(eq(doctorsTable.id, id));
  if (!doctor) {
    res.status(404).json({ error: "Doctor not found" });
    return;
  }

  const approve = req.body?.approve !== false;

  if (approve) {
    // Apply pending changes to current fields
    const updates: Partial<typeof doctorsTable.$inferInsert> = {};
    if (doctor.pendingBio !== null) updates.bio = doctor.pendingBio;
    if (doctor.pendingPrice !== null) updates.price = doctor.pendingPrice;
    if (doctor.pendingSpecialty !== null) updates.specialty = doctor.pendingSpecialty;
    if (doctor.pendingLanguages !== null) updates.languages = doctor.pendingLanguages;
    if (doctor.pendingGender !== null) updates.gender = doctor.pendingGender;
    if (doctor.pendingPaymentInfo !== null) updates.paymentInfo = doctor.pendingPaymentInfo;
    if (doctor.pendingAvatarUrl !== null) updates.avatarUrl = doctor.pendingAvatarUrl;

    // Clear pending fields and rejection status
    updates.pendingBio = null;
    updates.pendingPrice = null;
    updates.pendingSpecialty = null;
    updates.pendingLanguages = null;
    updates.pendingGender = null;
    updates.pendingPaymentInfo = null;
    updates.pendingAvatarUrl = null;
    updates.isRejected = false;
    updates.rejectionReason = null;

    await db.update(doctorsTable).set(updates).where(eq(doctorsTable.id, id));
  } else {
    // Reject: clear pending fields and set rejected flag
    await db.update(doctorsTable).set({
      pendingBio: null,
      pendingPrice: null,
      pendingSpecialty: null,
      pendingLanguages: null,
      pendingGender: null,
      pendingPaymentInfo: null,
      pendingAvatarUrl: null,
      isRejected: true,
      rejectionReason: req.body?.reason || null,
    }).where(eq(doctorsTable.id, id));
  }

  res.json({ success: true });
});

router.patch("/admin/doctors/:id", requireAuth, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid doctor id" }); return; }

  const { price, specialty } = req.body ?? {};
  const updates: Record<string, any> = {};
  if (price !== undefined) {
    updates.price = price;
    updates.pendingPrice = null; // Direct admin update overrides pending doctor change
    updates.priceChangedByAdmin = true;
  }
  if (specialty !== undefined) {
    updates.specialty = Array.isArray(specialty) ? specialty : [specialty];
    updates.pendingSpecialty = null;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [updated] = await db
    .update(doctorsTable)
    .set(updates)
    .where(eq(doctorsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Doctor not found" });
    return;
  }

  res.json(updated);
});

router.patch("/admin/doctors/:id/approve", requireAuth, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid doctor id" });
    return;
  }

  const approve = req.body?.approve !== false;
  const reason = req.body?.reason || null;

  const [updated] = await db
    .update(doctorsTable)
    .set({ 
      isApproved: approve,
      isRejected: !approve,
      rejectionReason: approve ? null : reason
    })
    .where(eq(doctorsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Doctor not found" });
    return;
  }

  res.json({ success: true, isApproved: updated.isApproved, isRejected: updated.isRejected });
});

router.get("/admin/users", requireAuth, requireRole("admin"), async (_req: AuthRequest, res): Promise<void> => {
  const users = await db.select({
    id: usersTable.id,
    firstName: usersTable.firstName,
    lastName: usersTable.lastName,
    email: usersTable.email,
    phone: usersTable.phone,
    role: usersTable.role,
    createdAt: usersTable.createdAt,
    isEmailVerified: usersTable.isEmailVerified,
    isApproved: doctorsTable.isApproved,
    isRejected: doctorsTable.isRejected,
    doctorId: doctorsTable.id,
  }).from(usersTable)
    .leftJoin(doctorsTable, eq(usersTable.id, doctorsTable.userId));

  res.json(users.map(u => ({
    ...u,
    createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : new Date(u.createdAt).toISOString(),
  })));
});

router.post("/admin/users/:id/repair-doctor", requireAuth, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid user id" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user || user.role !== "doctor") {
    res.status(400).json({ error: "User is not a doctor or not found" });
    return;
  }

  const [existingDoctor] = await db.select().from(doctorsTable).where(eq(doctorsTable.userId, id));
  if (existingDoctor) {
    res.status(400).json({ error: "Doctor profile already exists" });
    return;
  }

  // Create default doctor profile
  await db.insert(doctorsTable).values({
    userId: id,
    specialty: ["Psychiatrist"],
    type: "psychiatrist",
    gender: "male",
    price: 0,
    isApproved: false,
    isOnline: false,
    languages: ["Arabic"],
    sessionType: "individual",
    rating: 0,
    reviewCount: 0,
    immediateAvailable: false,
    freeConsultation: false,
  });

  res.json({ success: true });
});

router.patch("/admin/users/:id/verify-email", requireAuth, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ isEmailVerified: true, emailVerificationToken: null })
    .where(eq(usersTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ success: true });
});

router.post("/admin/users", requireAuth, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
  const parsed = CreateAdminUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { firstName, lastName, email, password, phone } = parsed.data;
  const trimmedFirstName = firstName?.trim();
  const trimmedLastName = lastName?.trim();
  const trimmedEmail = email.trim().toLowerCase();

  if (!trimmedFirstName || !trimmedLastName || !trimmedEmail || !password) {
    res.status(400).json({ error: "First Name, Last Name, email and password are required" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, trimmedEmail));
  if (existing) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const [created] = await db.insert(usersTable).values({
    firstName: trimmedFirstName,
    lastName: trimmedLastName,
    email: trimmedEmail,
    passwordHash,
    phone: phone?.trim() || null,
    role: "admin",
    isEmailVerified: true,
  }).returning();

  res.status(201).json({
    id: created.id,
    firstName: created.firstName,
    lastName: created.lastName,
    email: created.email,
    phone: created.phone ?? null,
    role: created.role,
    preferredLang: created.preferredLang,
    createdAt: created.createdAt.toISOString(),
  });
});

router.patch("/admin/users/:id/reset-password", requireAuth, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  const { newPassword } = req.body ?? {};
  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
    res.status(400).json({ error: "newPassword must be at least 8 characters" });
    return;
  }

  const passwordHash = await hashPassword(newPassword);

  const [updated] = await db
    .update(usersTable)
    .set({ passwordHash })
    .where(eq(usersTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ success: true });
});

router.patch("/admin/users/:id/approve-doctor", requireAuth, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid user id" }); return; }

  const [doctor] = await db.select().from(doctorsTable).where(eq(doctorsTable.userId, id));
  if (!doctor) {
    res.status(404).json({ error: "Doctor profile not found" });
    return;
  }

  const approve = req.body?.approve !== false;
  await db.update(doctorsTable).set({ isApproved: approve }).where(eq(doctorsTable.id, doctor.id));

  res.json({ success: true });
});

router.delete("/admin/users/:id", requireAuth, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.role === "admin") {
    res.status(403).json({ error: "Cannot delete an admin account" });
    return;
  }

  await db.delete(usersTable).where(eq(usersTable.id, id));

  res.json({ success: true });
});

router.get("/admin/stats", requireAuth, requireRole("admin"), async (_req: AuthRequest, res): Promise<void> => {
  const [patientStats] = await db.select({ totalPatients: count() }).from(usersTable).where(eq(usersTable.role, "patient"));
  const [doctorStats] = await db.select({ totalDoctors: count() }).from(usersTable).where(eq(usersTable.role, "doctor"));
  const [apptStats] = await db.select({ totalAppointments: count() }).from(appointmentsTable);
  const [paidStats] = await db.select({ paidAppointments: count() }).from(appointmentsTable).where(eq(appointmentsTable.isPaid, true));
  const [pendingStats] = await db.select({ pendingAppointments: count() }).from(appointmentsTable).where(eq(appointmentsTable.status, "pending"));

  const totalPatients = patientStats?.totalPatients ?? 0;
  const totalDoctors = doctorStats?.totalDoctors ?? 0;
  const totalAppointments = apptStats?.totalAppointments ?? 0;
  const paidAppointments = paidStats?.paidAppointments ?? 0;
  const pendingAppointments = pendingStats?.pendingAppointments ?? 0;

  const paidAppts = await db.select({ price: doctorsTable.price }).from(appointmentsTable)
    .innerJoin(doctorsTable, eq(appointmentsTable.doctorId, doctorsTable.id))
    .where(eq(appointmentsTable.isPaid, true));

  const totalRevenue = paidAppts.reduce((sum, a) => sum + a.price, 0);

  const [pendingProfileStats] = await db.select({ count: count() }).from(doctorsTable).where(
    sql`${doctorsTable.pendingBio} IS NOT NULL OR 
        ${doctorsTable.pendingPrice} IS NOT NULL OR 
        ${doctorsTable.pendingAvatarUrl} IS NOT NULL OR 
        ${doctorsTable.pendingSpecialty} IS NOT NULL OR 
        ${doctorsTable.pendingLanguages} IS NOT NULL OR 
        ${doctorsTable.pendingGender} IS NOT NULL OR 
        ${doctorsTable.pendingPaymentInfo} IS NOT NULL`
  );

  const pendingProfileChanges = pendingProfileStats?.count ?? 0;

  res.json({
    totalPatients,
    totalDoctors,
    totalAppointments,
    paidAppointments,
    pendingAppointments,
    totalRevenue,
    pendingProfileChanges,
  });
});

router.get("/admin/reviews", requireAuth, requireRole("admin"), async (_req: AuthRequest, res): Promise<void> => {
  const reviews = await db
    .select({
      appointmentId: appointmentsTable.id,
      patientRating: appointmentsTable.patientRating,
      patientReview: appointmentsTable.patientReview,
      isReviewApproved: appointmentsTable.isReviewApproved,
      createdAt: appointmentsTable.createdAt,
      patientName: sql<string>`${usersTable.firstName} || ' ' || ${usersTable.lastName}`,
      doctorName: sql<string>`d_users.first_name || ' ' || d_users.last_name`,
    })
    .from(appointmentsTable)
    .innerJoin(usersTable, eq(appointmentsTable.patientId, usersTable.id))
    .innerJoin(doctorsTable, eq(appointmentsTable.doctorId, doctorsTable.id))
    .innerJoin(sql`${usersTable} as d_users`, eq(doctorsTable.userId, sql`d_users.id`))
    .where(ne(appointmentsTable.patientRating, null as any));

  res.json(reviews.map(r => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  })));
});

router.patch("/admin/reviews/:id/approve", requireAuth, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid appointment id" }); return; }

  const approve = req.body?.approve !== false;

  const [updated] = await db
    .update(appointmentsTable)
    .set({ isReviewApproved: approve })
    .where(eq(appointmentsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Review not found" });
    return;
  }

  res.json({ success: true, isReviewApproved: updated.isReviewApproved });
});

router.post("/admin/dev/verify-all", requireAuth, requireRole("admin"), async (_req: AuthRequest, res): Promise<void> => {
  await db.update(usersTable)
    .set({ isEmailVerified: true, emailVerificationToken: null })
    .where(eq(usersTable.isEmailVerified, false));
  res.json({ success: true });
});

router.post("/admin/dev/approve-all", requireAuth, requireRole("admin"), async (_req: AuthRequest, res): Promise<void> => {
  await db.update(doctorsTable)
    .set({ isApproved: true })
    .where(eq(doctorsTable.isApproved, false));
  res.json({ success: true });
});

export default router;
