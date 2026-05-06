// @ts-nocheck
import { Router } from "express";
import { db } from "../../db/src/index.js";
import { doctorsTable, usersTable, slotsTable } from "../../db/src/index.js";
import { eq, and, or, like, sql } from "drizzle-orm";
import { GetDoctorsQueryParams } from "../../zod/src/index.js";

console.log("[DOCTORS_ROUTE] Tables check:", { doctorsTable: !!doctorsTable, usersTable: !!usersTable, slotsTable: !!slotsTable });

const router: any = Router();

const SPECIALTIES = [
  // Psychologist
  "Anxiety & Stress",
  "Depression",
  "OCD",
  "ADHD",
  "Trauma & PTSD",
  "Addiction",
  "Relationships",
  "Child & Adolescent",
  "Family Therapy",
  "Eating Disorders",
  "Bipolar Disorder",
  "Schizophrenia",
  "Sleep Disorders",
  "Grief & Loss",
  // Psychiatrist
  "Medication Management",
  "Mood Disorders",
  "Psychosis",
  "Adult ADHD",
  "Forensic Psychiatry",
  "General Psychiatry",
];

router.get("/specialties", async (_req, res): Promise<void> => {
  res.json(SPECIALTIES);
});

router.get("/doctors", async (req, res): Promise<void> => {
  const parsed = GetDoctorsQueryParams.safeParse(req.query);
  const filters = parsed.success ? parsed.data : {};

  const conditions = [eq(doctorsTable.isApproved, true)];
  if (filters.type) conditions.push(eq(doctorsTable.type, filters.type));
  if (filters.sessionType) conditions.push(eq(doctorsTable.sessionType, filters.sessionType));
  if (filters.gender) conditions.push(eq(doctorsTable.gender, filters.gender));
  if (filters.immediate === "true") {
    const onlineOrImmediate = or(
      eq(doctorsTable.isOnline, true),
      eq(doctorsTable.immediateAvailable, true),
    );
    if (onlineOrImmediate) conditions.push(onlineOrImmediate);
  }
  if (filters.freeConsultation === "true") conditions.push(eq(doctorsTable.freeConsultation, true));
  if (filters.specialty) conditions.push(like(doctorsTable.specialty, `%${filters.specialty}%`));

  const results = await db
    .select({
      doctors: {
        id: doctorsTable.id,
        userId: doctorsTable.userId,
        specialty: doctorsTable.specialty,
        type: doctorsTable.type,
        price: doctorsTable.price,
        rating: doctorsTable.rating,
        reviewCount: doctorsTable.reviewCount,
        isOnline: doctorsTable.isOnline,
        immediateAvailable: doctorsTable.immediateAvailable,
        freeConsultation: doctorsTable.freeConsultation,
        yearsExperience: doctorsTable.yearsExperience,
        avatarUrl: doctorsTable.avatarUrl,
        bio: doctorsTable.bio,
        languages: doctorsTable.languages,
        isApproved: doctorsTable.isApproved,
      },
      users: {
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
      }
    })
    .from(doctorsTable)
    .innerJoin(usersTable, eq(doctorsTable.userId, usersTable.id))
    .where(and(...conditions));

  const doctors = results.map(r => ({
    ...r.doctors,
    specialty: Array.isArray(r.doctors.specialty) ? r.doctors.specialty : [r.doctors.specialty],
    languages: Array.isArray(r.doctors.languages) ? r.doctors.languages : (r.doctors.languages ? [r.doctors.languages] : []),
    firstName: r.users.firstName,
    lastName: r.users.lastName,
    name: `${r.users.firstName} ${r.users.lastName}`,
    email: r.users.email,
  }));

  res.json(doctors);
});

router.get("/doctors/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [row] = await db
    .select({
      doctors: {
        id: doctorsTable.id,
        userId: doctorsTable.userId,
        specialty: doctorsTable.specialty,
        type: doctorsTable.type,
        price: doctorsTable.price,
        rating: doctorsTable.rating,
        reviewCount: doctorsTable.reviewCount,
        isOnline: doctorsTable.isOnline,
        immediateAvailable: doctorsTable.immediateAvailable,
        freeConsultation: doctorsTable.freeConsultation,
        yearsExperience: doctorsTable.yearsExperience,
        avatarUrl: doctorsTable.avatarUrl,
        bio: doctorsTable.bio,
        languages: doctorsTable.languages,
        isApproved: doctorsTable.isApproved,
      },
      users: {
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
      }
    })
    .from(doctorsTable)
    .innerJoin(usersTable, eq(doctorsTable.userId, usersTable.id))
    .where(eq(doctorsTable.id, id));

  if (!row) {
    res.status(404).json({ error: "Doctor not found" });
    return;
  }

  const doctor = {
    ...row.doctors,
    specialty: Array.isArray(row.doctors.specialty) ? row.doctors.specialty : [row.doctors.specialty],
    languages: Array.isArray(row.doctors.languages) ? row.doctors.languages : (row.doctors.languages ? [row.doctors.languages] : []),
    firstName: row.users.firstName,
    lastName: row.users.lastName,
    name: `${row.users.firstName} ${row.users.lastName}`,
    email: row.users.email,
  };

  res.json(doctor);
});

router.get("/doctors/:id/slots", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const slots = await db
    .select()
    .from(slotsTable)
    .where(and(eq(slotsTable.doctorId, id), eq(slotsTable.isBooked, false)));

  res.json(slots.map(s => ({
    id: s.id,
    doctorId: s.doctorId,
    startTime: s.startTime instanceof Date ? s.startTime.toISOString() : new Date(s.startTime).toISOString(),
    endTime: s.endTime instanceof Date ? s.endTime.toISOString() : new Date(s.endTime).toISOString(),
    isBooked: s.isBooked,
  })));
});

router.delete("/doctors/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  await db.delete(slotsTable).where(eq(slotsTable.doctorId, id));
  await db.delete(doctorsTable).where(eq(doctorsTable.id, id));
  await db.delete(usersTable).where(eq(usersTable.id, id));

  res.json({ success: true });
});

export default router;
