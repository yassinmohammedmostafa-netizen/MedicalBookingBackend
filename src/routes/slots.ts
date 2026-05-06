// @ts-nocheck
import { Router } from "express";
import { db } from "../db/src/index.js";
import { slotsTable, doctorsTable, appointmentsTable } from "../db/src/index.js";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/requireAuth.js";
import { CreateSlotBody, DeleteSlotParams } from "../zod/src/index.js";

const router: any = Router();

router.get("/doctor/slots", requireAuth, requireRole("doctor"), async (req: AuthRequest, res): Promise<void> => {
  const [doctor] = await db.select().from(doctorsTable).where(eq(doctorsTable.userId, req.userId!));
  if (!doctor) {
    res.status(404).json({ error: "Doctor profile not found" });
    return;
  }

  const slots = await db.select().from(slotsTable).where(eq(slotsTable.doctorId, doctor.id));
  const appts = await db.select().from(appointmentsTable).where(eq(appointmentsTable.doctorId, doctor.id));
  
  res.json(slots.map(s => {
    const activeAppt = appts.find(a => a.slotId === s.id && a.status !== "cancelled");
    return {
      id: s.id,
      doctorId: s.doctorId,
      startTime: s.startTime.toISOString(),
      endTime: s.endTime.toISOString(),
      isBooked: s.isBooked,
      hasPending: !!activeAppt && !s.isBooked
    };
  }));
});

router.post("/doctor/slots", requireAuth, requireRole("doctor"), async (req: AuthRequest, res): Promise<void> => {
  const parsed = CreateSlotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [doctor] = await db.select().from(doctorsTable).where(eq(doctorsTable.userId, req.userId!));
  if (!doctor) {
    res.status(404).json({ error: "Doctor profile not found" });
    return;
  }

  const startTime = new Date(parsed.data.startTime);
  const endTime = new Date(parsed.data.endTime);

  const now = Date.now();
  if (startTime.getTime() < now - 60000) { // 1 minute buffer for slow requests
    res.status(400).json({ error: "Cannot create slots in the past. Please select a future time." });
    return;
  }

  const [slot] = await db.insert(slotsTable).values({
    doctorId: doctor.id,
    startTime,
    endTime,
  }).returning();

  res.status(201).json({
    id: slot.id,
    doctorId: slot.doctorId,
    startTime: slot.startTime.toISOString(),
    endTime: slot.endTime.toISOString(),
    isBooked: slot.isBooked,
  });
});

router.delete("/doctor/slots/:id", requireAuth, requireRole("doctor"), async (req: AuthRequest, res): Promise<void> => {
  const params = DeleteSlotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [doctor] = await db.select().from(doctorsTable).where(eq(doctorsTable.userId, req.userId!));
  if (!doctor) {
    res.status(404).json({ error: "Doctor profile not found" });
    return;
  }

  // Check if slot has ANY appointment (even pending)
  const [existingAppt] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.slotId, params.data.id));
  if (existingAppt && existingAppt.status !== "cancelled") {
    res.status(400).json({ error: "Cannot delete a slot that has an active appointment. Please cancel the appointment first." });
    return;
  }

  const [slot] = await db
    .delete(slotsTable)
    .where(and(eq(slotsTable.id, params.data.id), eq(slotsTable.doctorId, doctor.id)))
    .returning();

  if (!slot) {
    res.status(404).json({ error: "Slot not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
