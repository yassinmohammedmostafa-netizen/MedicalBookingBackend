// @ts-nocheck
import { Router } from "express";
import { db } from "../../db/src/index.js";
import { appointmentsTable, doctorsTable, slotsTable, usersTable, messagesTable } from "../../db/src/index.js";
import { eq, and, asc, sql } from "drizzle-orm";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/requireAuth.js";
import {
  CreateAppointmentBody,
  MarkAppointmentPaidParams,
  UpdateAppointmentStatusParams,
  UpdateAppointmentStatusBody,
  GetAppointmentParams,
} from "../../zod/src/index.js";

const router: any = Router();

// Helper to safely format appointment data with full doctor/patient/slot context
function formatAppointmentRow(row: any) {
  const appt = row.appointment;
  const patient = row.patient;
  const doctorUser = row.doctorUser;
  const doctor = row.doctor;
  const slot = row.slot;

  try {
    // Safely determine start/end times
    const startTime = slot?.startTime instanceof Date 
      ? slot.startTime.toISOString() 
      : (slot?.startTime ? new Date(slot.startTime).toISOString() : (appt.createdAt instanceof Date ? appt.createdAt.toISOString() : new Date(appt.createdAt).toISOString()));
    
    const endTime = slot?.endTime instanceof Date 
      ? slot.endTime.toISOString() 
      : (slot?.endTime ? new Date(slot.endTime).toISOString() : null);

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
      patientRating: appt.patientRating ?? null,
      patientReview: appt.patientReview ?? null,
      patientName: patient ? `${patient.firstName} ${patient.lastName}` : "Unknown Patient",
      patientEmail: patient?.email ?? null,
      patientPhone: patient?.phone ?? null,
      doctorName: doctorUser ? `${doctorUser.firstName} ${doctorUser.lastName}` : "Unknown Doctor",
      doctorSpecialty: doctor?.specialty ?? null,
      doctorPrice: doctor?.price ?? null,
      doctorPaymentInfo: doctor?.paymentInfo ?? null,
      startTime,
      endTime,
      createdAt: appt.createdAt instanceof Date ? appt.createdAt.toISOString() : new Date(appt.createdAt).toISOString(),
      cancelledBy: appt.cancelledBy,
      cancelledAt: appt.cancelledAt instanceof Date ? appt.cancelledAt.toISOString() : (appt.cancelledAt ? new Date(appt.cancelledAt).toISOString() : null),
      doctorUserId: doctorUser?.id ?? null,
    };
  } catch (err) {
    console.error("[FORMAT_APPT] Formatting error for appt ID:", appt.id, err);
    return { id: appt.id, error: "Formatting failed" };
  }
}

router.get("/appointments", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  try {
    const baseQuery = db
      .select({
        appointment: appointmentsTable,
        patient: usersTable,
        doctor: doctorsTable,
        doctorUser: sql`d_users`,
        slot: slotsTable,
      })
      .from(appointmentsTable)
      .innerJoin(usersTable, eq(appointmentsTable.patientId, usersTable.id))
      .innerJoin(doctorsTable, eq(appointmentsTable.doctorId, doctorsTable.id))
      .innerJoin(sql`${usersTable} as d_users`, eq(doctorsTable.userId, sql`d_users.id`))
      .leftJoin(slotsTable, eq(appointmentsTable.slotId, slotsTable.id));

    let rows;
    if (req.userRole === "patient") {
      rows = await baseQuery.where(eq(appointmentsTable.patientId, req.userId!));
    } else if (req.userRole === "doctor") {
      const [doctor] = await db.select().from(doctorsTable).where(eq(doctorsTable.userId, req.userId!));
      if (!doctor) {
        res.json([]);
        return;
      }
      rows = await baseQuery.where(eq(appointmentsTable.doctorId, doctor.id));
    } else {
      res.status(403).json({ error: "Admins should use /api/admin/appointments" });
      return;
    }

    const formatted = rows.map(formatAppointmentRow);
    res.json(formatted);
  } catch (err) {
    console.error("[GET_APPOINTMENTS] Error:", err);
    res.status(500).json({ error: "Failed to fetch appointments" });
  }
});

router.post("/appointments", requireAuth, requireRole("patient"), async (req: AuthRequest, res): Promise<void> => {
  // Fix for instant sessions where slotId is sent as null
  if (req.body && req.body.slotId === null) {
    req.body.slotId = undefined;
  }

  const parsed = CreateAppointmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { slotId, doctorId, notes } = parsed.data;

  const [doctor] = await db.select().from(doctorsTable).where(eq(doctorsTable.id, doctorId));
  if (!doctor) {
    res.status(400).json({ error: "Doctor not found" });
    return;
  }

  // Instant booking — no slotId provided
  if (slotId == null) {
    if (!doctor.isOnline && !doctor.immediateAvailable) {
      res.status(400).json({ error: "Doctor is not available for instant sessions right now" });
      return;
    }

    const [appointment] = await db.insert(appointmentsTable).values({
      patientId: req.userId!,
      doctorId,
      slotId: null,
      notes: notes ?? null,
      status: "confirmed",
    }).returning();

    // Automated first message
    await db.insert(messagesTable).values({
      appointmentId: appointment.id,
      senderId: 1,
      senderName: "System",
      senderRole: "admin",
      content: `Thank you for booking an instant session! Please complete your payment via ${doctor.paymentInfo || "InstaPay or your preferred method"} and share the receipt here for verification.`,
    });

    // Fetch the fully joined appointment data to return to the client
    const [row] = await db
      .select({
        appointment: appointmentsTable,
        patient: usersTable,
        doctor: doctorsTable,
        doctorUser: sql`d_users`,
        slot: slotsTable,
      })
      .from(appointmentsTable)
      .innerJoin(usersTable, eq(appointmentsTable.patientId, usersTable.id))
      .innerJoin(doctorsTable, eq(appointmentsTable.doctorId, doctorsTable.id))
      .innerJoin(sql`${usersTable} as d_users`, eq(doctorsTable.userId, sql`d_users.id`))
      .leftJoin(slotsTable, eq(appointmentsTable.slotId, slotsTable.id))
      .where(eq(appointmentsTable.id, appointment.id));

    res.status(201).json(formatAppointmentRow(row));
    return;
  }

  // Slot-based booking
  const [slot] = await db.select().from(slotsTable).where(and(eq(slotsTable.id, slotId), eq(slotsTable.doctorId, doctorId)));
  if (!slot) {
    res.status(400).json({ error: "Slot not found for this doctor" });
    return;
  }
  if (slot.isBooked) {
    res.status(400).json({ error: "Slot is already booked" });
    return;
  }

  const [appointment] = await db.insert(appointmentsTable).values({
    patientId: req.userId!,
    doctorId,
    slotId,
    notes: notes ?? null,
    status: "pending",
  }).returning();

  // WE NO LONGER MARK SLOT AS BOOKED IMMEDIATELY. 
  // It only happens when the appointment is marked as paid.

  // Automated first message
  await db.insert(messagesTable).values({
    appointmentId: appointment.id,
    senderId: 1, // Admin or system user ID (Assuming 1 is admin)
    senderName: "System",
    senderRole: "admin",
    content: `Thank you for booking! Please complete your payment via ${doctor.paymentInfo || "InstaPay or your preferred method"} and share the receipt here to confirm your session.`,
  });

  // Fetch the fully joined appointment data
  const [row] = await db
    .select({
      appointment: appointmentsTable,
      patient: usersTable,
      doctor: doctorsTable,
      doctorUser: sql`d_users`,
      slot: slotsTable,
    })
    .from(appointmentsTable)
    .innerJoin(usersTable, eq(appointmentsTable.patientId, usersTable.id))
    .innerJoin(doctorsTable, eq(appointmentsTable.doctorId, doctorsTable.id))
    .innerJoin(sql`${usersTable} as d_users`, eq(doctorsTable.userId, sql`d_users.id`))
    .leftJoin(slotsTable, eq(appointmentsTable.slotId, slotsTable.id))
    .where(eq(appointmentsTable.id, appointment.id));

  res.status(201).json(formatAppointmentRow(row));
});

router.get("/appointments/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const params = GetAppointmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [appt] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, params.data.id));
  if (!appt) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }

  const [row] = await db
    .select({
      appointment: appointmentsTable,
      patient: usersTable,
      doctor: doctorsTable,
      doctorUser: sql`d_users`,
      slot: slotsTable,
    })
    .from(appointmentsTable)
    .innerJoin(usersTable, eq(appointmentsTable.patientId, usersTable.id))
    .innerJoin(doctorsTable, eq(appointmentsTable.doctorId, doctorsTable.id))
    .innerJoin(sql`${usersTable} as d_users`, eq(doctorsTable.userId, sql`d_users.id`))
    .leftJoin(slotsTable, eq(appointmentsTable.slotId, slotsTable.id))
    .where(eq(appointmentsTable.id, appt.id));

  res.json(formatAppointmentRow(row));
});

router.patch("/appointments/:id/mark-paid", requireAuth, requireRole("doctor", "admin"), async (req: AuthRequest, res): Promise<void> => {
  const params = MarkAppointmentPaidParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [appt] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, params.data.id));
  if (!appt) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }

  if (req.userRole === "doctor") {
    const [doctor] = await db.select().from(doctorsTable).where(eq(doctorsTable.userId, req.userId!));
    if (!doctor || doctor.id !== appt.doctorId) {
      res.status(403).json({ error: "You can only mark your own appointments as paid" });
      return;
    }
  }

  const [updated] = await db
    .update(appointmentsTable)
    .set({ isPaid: true, paidAt: new Date(), status: "confirmed" })
    .where(eq(appointmentsTable.id, params.data.id))
    .returning();

  // If this was a slot-based booking, mark the slot as booked and cancel others
  if (updated.slotId) {
    await db.update(slotsTable).set({ isBooked: true }).where(eq(slotsTable.id, updated.slotId));
    
    // Cancel all other pending appointments for this same slot
    await db.update(appointmentsTable)
      .set({ 
        status: "cancelled", 
        cancelledBy: 1, // System/Admin
        cancelledAt: new Date() 
      })
      .where(and(
        eq(appointmentsTable.slotId, updated.slotId),
        eq(appointmentsTable.status, "pending"),
        eq(appointmentsTable.isPaid, false)
        // We don't need to check id != updated.id because updated.isPaid is now true
      ));
  }

  const [row] = await db
    .select({
      appointment: appointmentsTable,
      patient: usersTable,
      doctor: doctorsTable,
      doctorUser: sql`d_users`,
      slot: slotsTable,
    })
    .from(appointmentsTable)
    .innerJoin(usersTable, eq(appointmentsTable.patientId, usersTable.id))
    .innerJoin(doctorsTable, eq(appointmentsTable.doctorId, doctorsTable.id))
    .innerJoin(sql`${usersTable} as d_users`, eq(doctorsTable.userId, sql`d_users.id`))
    .leftJoin(slotsTable, eq(appointmentsTable.slotId, slotsTable.id))
    .where(eq(appointmentsTable.id, updated.id));

  res.json(formatAppointmentRow(row));
});

router.patch("/appointments/:id/mark-unpaid", requireAuth, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
  const params = MarkAppointmentPaidParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [appt] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, params.data.id));
  if (!appt) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }

  const [updated] = await db
    .update(appointmentsTable)
    .set({ isPaid: false, paidAt: null })
    .where(eq(appointmentsTable.id, params.data.id))
    .returning();

  const [row] = await db
    .select({
      appointment: appointmentsTable,
      patient: usersTable,
      doctor: doctorsTable,
      doctorUser: sql`d_users`,
      slot: slotsTable,
    })
    .from(appointmentsTable)
    .innerJoin(usersTable, eq(appointmentsTable.patientId, usersTable.id))
    .innerJoin(doctorsTable, eq(appointmentsTable.doctorId, doctorsTable.id))
    .innerJoin(sql`${usersTable} as d_users`, eq(doctorsTable.userId, sql`d_users.id`))
    .leftJoin(slotsTable, eq(appointmentsTable.slotId, slotsTable.id))
    .where(eq(appointmentsTable.id, updated.id));

  res.json(formatAppointmentRow(row));
});

router.patch("/appointments/:id/status", requireAuth, requireRole("doctor", "admin"), async (req: AuthRequest, res): Promise<void> => {
  const params = UpdateAppointmentStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateAppointmentStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [appt] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, params.data.id));
  if (!appt) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }

  const updates: Partial<typeof appointmentsTable.$inferInsert> = { status: parsed.data.status };
  if (parsed.data.status === "cancelled") {
    updates.cancelledBy = req.userId!;
    updates.cancelledAt = new Date();
    if (appt.slotId) {
      await db.update(slotsTable).set({ isBooked: false }).where(eq(slotsTable.id, appt.slotId));
    }
  }

  const [updated] = await db
    .update(appointmentsTable)
    .set(updates)
    .where(eq(appointmentsTable.id, params.data.id))
    .returning();

  const [row] = await db
    .select({
      appointment: appointmentsTable,
      patient: usersTable,
      doctor: doctorsTable,
      doctorUser: sql`d_users`,
      slot: slotsTable,
    })
    .from(appointmentsTable)
    .innerJoin(usersTable, eq(appointmentsTable.patientId, usersTable.id))
    .innerJoin(doctorsTable, eq(appointmentsTable.doctorId, doctorsTable.id))
    .innerJoin(sql`${usersTable} as d_users`, eq(doctorsTable.userId, sql`d_users.id`))
    .leftJoin(slotsTable, eq(appointmentsTable.slotId, slotsTable.id))
    .where(eq(appointmentsTable.id, updated.id));

  res.json(formatAppointmentRow(row));
});

router.patch("/appointments/:id/cancel", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid appointment id" }); return; }

  const [appt] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, id));
  if (!appt) { res.status(404).json({ error: "Appointment not found" }); return; }

  // Check permission
  if (req.userRole === "patient" && appt.patientId !== req.userId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  if (req.userRole === "doctor") {
    const [doctor] = await db.select().from(doctorsTable).where(eq(doctorsTable.userId, req.userId!));
    if (!doctor || doctor.id !== appt.doctorId) { res.status(403).json({ error: "Forbidden" }); return; }
  }

  if (appt.status === "completed" || appt.status === "cancelled") {
    res.status(400).json({ error: "Cannot cancel a completed or already cancelled appointment" });
    return;
  }

  const [updated] = await db
    .update(appointmentsTable)
    .set({ 
      status: "cancelled", 
      cancelledBy: req.userId!, 
      cancelledAt: new Date() 
    })
    .where(eq(appointmentsTable.id, id))
    .returning();

  if (appt.slotId) {
    await db.update(slotsTable).set({ isBooked: false }).where(eq(slotsTable.id, appt.slotId));
  }

  const [row] = await db
    .select({
      appointment: appointmentsTable,
      patient: usersTable,
      doctor: doctorsTable,
      doctorUser: sql`d_users`,
      slot: slotsTable,
    })
    .from(appointmentsTable)
    .innerJoin(usersTable, eq(appointmentsTable.patientId, usersTable.id))
    .innerJoin(doctorsTable, eq(appointmentsTable.doctorId, doctorsTable.id))
    .innerJoin(sql`${usersTable} as d_users`, eq(doctorsTable.userId, sql`d_users.id`))
    .leftJoin(slotsTable, eq(appointmentsTable.slotId, slotsTable.id))
    .where(eq(appointmentsTable.id, updated.id));

  res.json(formatAppointmentRow(row));
});

router.get("/appointments/:id/messages", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const appointmentId = parseInt(req.params.id as string, 10);
  if (isNaN(appointmentId)) { res.status(400).json({ error: "Invalid appointment id" }); return; }

  const [appt] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, appointmentId));
  if (!appt) { res.status(404).json({ error: "Appointment not found" }); return; }

  if (req.userRole === "patient" && appt.patientId !== req.userId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  if (req.userRole === "doctor") {
    const [doctor] = await db.select().from(doctorsTable).where(eq(doctorsTable.userId, req.userId!));
    if (!doctor || doctor.id !== appt.doctorId) { res.status(403).json({ error: "Forbidden" }); return; }
  }
  // Admin is always allowed

  const messages = await db.select().from(messagesTable)
    .where(eq(messagesTable.appointmentId, appointmentId))
    .orderBy(asc(messagesTable.createdAt));

  res.json(messages);
});

router.post("/appointments/:id/messages", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const appointmentId = parseInt(req.params.id as string, 10);
  if (isNaN(appointmentId)) { res.status(400).json({ error: "Invalid appointment id" }); return; }

  const content = (req.body?.content ?? "").trim();
  if (!content) { res.status(400).json({ error: "Message content is required" }); return; }

  const [appt] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, appointmentId));
  if (!appt) { res.status(404).json({ error: "Appointment not found" }); return; }

  if (req.userRole === "patient" && appt.patientId !== req.userId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  if (req.userRole === "doctor") {
    const [doctor] = await db.select().from(doctorsTable).where(eq(doctorsTable.userId, req.userId!));
    if (!doctor || doctor.id !== appt.doctorId) { res.status(403).json({ error: "Forbidden" }); return; }
  }
  // Admin is always allowed

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  const [message] = await db.insert(messagesTable).values({
    appointmentId,
    senderId: req.userId!,
    senderName: user ? `${user.firstName} ${user.lastName}` : "Unknown",
    senderRole: req.userRole!,
    content,
    type: req.body?.type ?? "text",
    fileUrl: req.body?.fileUrl ?? null,
  }).returning();

  res.status(201).json(message);
});

router.patch("/appointments/:id/rate", requireAuth, requireRole("patient"), async (req: AuthRequest, res): Promise<void> => {
  const appointmentId = parseInt(req.params.id as string, 10);
  if (isNaN(appointmentId)) { res.status(400).json({ error: "Invalid appointment id" }); return; }

  const rating = req.body?.rating;
  if (!rating || typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    res.status(400).json({ error: "rating must be an integer between 1 and 5" });
    return;
  }
  const review: string | null = typeof req.body?.review === "string" && req.body.review.trim().length > 0
    ? req.body.review.trim().slice(0, 1000)
    : null;

  const [appt] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, appointmentId));
  if (!appt) { res.status(404).json({ error: "Appointment not found" }); return; }
  if (appt.patientId !== req.userId) { res.status(403).json({ error: "Forbidden" }); return; }
  if (appt.status !== "completed") { res.status(400).json({ error: "Can only rate completed appointments" }); return; }

  const [updated] = await db
    .update(appointmentsTable)
    .set({ patientRating: rating, ...(review !== null && { patientReview: review }) })
    .where(eq(appointmentsTable.id, appointmentId))
    .returning();

  const allRatings = await db
    .select({ patientRating: appointmentsTable.patientRating })
    .from(appointmentsTable)
    .where(eq(appointmentsTable.doctorId, appt.doctorId));

  const rated = allRatings.filter(a => a.patientRating != null);
  if (rated.length > 0) {
    const avg = Math.round((rated.reduce((s, a) => s + (a.patientRating ?? 0), 0) / rated.length) * 10) / 10;
    await db
      .update(doctorsTable)
      .set({ rating: avg, reviewCount: rated.length })
      .where(eq(doctorsTable.id, appt.doctorId));
  }

  const [row] = await db
    .select({
      appointment: appointmentsTable,
      patient: usersTable,
      doctor: doctorsTable,
      doctorUser: sql`d_users`,
      slot: slotsTable,
    })
    .from(appointmentsTable)
    .innerJoin(usersTable, eq(appointmentsTable.patientId, usersTable.id))
    .innerJoin(doctorsTable, eq(appointmentsTable.doctorId, doctorsTable.id))
    .innerJoin(sql`${usersTable} as d_users`, eq(doctorsTable.userId, sql`d_users.id`))
    .leftJoin(slotsTable, eq(appointmentsTable.slotId, slotsTable.id))
    .where(eq(appointmentsTable.id, updated.id));

  res.json(formatAppointmentRow(row));
});

router.get("/calendar", requireAuth, requireRole("doctor", "admin"), async (req: AuthRequest, res): Promise<void> => {
  let appointments: typeof appointmentsTable.$inferSelect[];

  if (req.userRole === "doctor") {
    const [doctor] = await db.select().from(doctorsTable).where(eq(doctorsTable.userId, req.userId!));
    if (!doctor) {
      res.json([]);
      return;
    }
    appointments = await db.select().from(appointmentsTable).where(and(eq(appointmentsTable.doctorId, doctor.id), eq(appointmentsTable.isPaid, true)));
  } else {
    appointments = await db.select().from(appointmentsTable).where(eq(appointmentsTable.isPaid, true));
  }

  if (appointments.length === 0) {
    res.json([]);
    return;
  }

  const rows = await db
    .select({
      appointment: appointmentsTable,
      patient: usersTable,
      doctor: doctorsTable,
      doctorUser: sql`d_users`,
      slot: slotsTable,
    })
    .from(appointmentsTable)
    .innerJoin(usersTable, eq(appointmentsTable.patientId, usersTable.id))
    .innerJoin(doctorsTable, eq(appointmentsTable.doctorId, doctorsTable.id))
    .innerJoin(sql`${usersTable} as d_users`, eq(doctorsTable.userId, sql`d_users.id`))
    .leftJoin(slotsTable, eq(appointmentsTable.slotId, slotsTable.id))
    .where(and(
      eq(appointmentsTable.id, sql`ANY(${appointments.map(a => a.id)})`)
    ));

  const formatted = rows.map(formatAppointmentRow);
  res.json(formatted);
});

/** Public — returns all patient reviews for a given doctor (rating + review text + patient first name) */
router.get("/doctors/:doctorId/reviews", async (req, res): Promise<void> => {
  const doctorId = parseInt(req.params.doctorId as string, 10);
  if (isNaN(doctorId)) { res.status(400).json({ error: "Invalid doctor id" }); return; }

  const rows = await db
    .select({
      id: appointmentsTable.id,
      patientRating: appointmentsTable.patientRating,
      patientReview: appointmentsTable.patientReview,
      patientId: appointmentsTable.patientId,
      createdAt: appointmentsTable.createdAt,
    })
    .from(appointmentsTable)
    .where(and(
      eq(appointmentsTable.doctorId, doctorId), 
      eq(appointmentsTable.status, "completed"),
      eq(appointmentsTable.isReviewApproved, true)
    ));

  const reviews = await Promise.all(
    rows
      .filter(r => r.patientRating != null)
      .map(async r => {
        const [patient] = await db.select({ firstName: usersTable.firstName }).from(usersTable).where(eq(usersTable.id, r.patientId));
        const firstName = patient?.firstName ?? "Patient";
        return {
          id: r.id,
          rating: r.patientRating!,
          review: r.patientReview ?? null,
          patientFirstName: firstName,
          createdAt: r.createdAt.toISOString(),
        };
      })
  );

  reviews.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(reviews);
});

export default router;
