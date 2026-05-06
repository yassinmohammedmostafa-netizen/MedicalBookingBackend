// @ts-nocheck
import { db } from "../../db/src/index.js";
import { usersTable, doctorsTable, slotsTable } from "../../db/src/index.js";
import { hashPassword } from "./auth.js";
import { logger } from "./logger.js";

export async function seedIfEmpty() {
  const existingUsers = await db.select().from(usersTable);
  if (existingUsers.length > 0) return;

  logger.info("Seeding initial data...");

  const adminHash = await hashPassword("admin123");
  const [admin] = await db.insert(usersTable).values({
    firstName: "Admin",
    lastName: "User",
    email: "admin@esaal.com",
    passwordHash: adminHash,
    role: "admin",
    isEmailVerified: true,
  }).returning();

  logger.info({ userId: admin.id }, "Admin created");

  const doctorData = [
    { firstName: "Ahmed", lastName: "Karim", specialty: "Anxiety & Stress", type: "psychiatrist", sessionType: "individual", gender: "male", price: 350, rating: 5, reviewCount: 48, bio: "Board-certified psychiatrist with 12 years experience specializing in anxiety disorders and stress management.", immediateAvailable: true, freeConsultation: false, yearsExperience: 12, languages: ["Arabic", "English"] },
    { firstName: "Sara", lastName: "Hassan", specialty: "Depression", type: "psychologist", sessionType: "individual", gender: "female", price: 280, rating: 5, reviewCount: 62, bio: "Clinical psychologist focused on CBT for depression and mood disorders. Creating a safe space for every patient.", immediateAvailable: false, freeConsultation: true, yearsExperience: 8, languages: ["Arabic"] },
    { firstName: "Omar", lastName: "Farid", specialty: "OCD", type: "psychiatrist", sessionType: "individual", gender: "male", price: 400, rating: 4, reviewCount: 31, bio: "Specialist in OCD and related disorders using ERP therapy with high success rates.", immediateAvailable: false, freeConsultation: false, yearsExperience: 15, languages: ["Arabic", "English", "French"] },
    { firstName: "Nadia", lastName: "Salah", specialty: "Child & Adolescent", type: "psychologist", sessionType: "group", gender: "female", price: 200, rating: 5, reviewCount: 89, bio: "Child psychologist dedicated to helping young people navigate emotional challenges and grow with confidence.", immediateAvailable: false, freeConsultation: true, yearsExperience: 10, languages: ["Arabic", "English"] },
    { firstName: "Khaled", lastName: "Mansour", specialty: "Addiction", type: "psychiatrist", sessionType: "both", gender: "male", price: 450, rating: 4, reviewCount: 25, bio: "Addiction medicine specialist helping patients reclaim their lives through evidence-based treatment programs.", immediateAvailable: true, freeConsultation: false, yearsExperience: 20, languages: ["Arabic"] },
    { firstName: "Mariam", lastName: "Youssef", specialty: "Trauma & PTSD", type: "psychologist", sessionType: "individual", gender: "female", price: 320, rating: 5, reviewCount: 54, bio: "Trauma-focused therapist using EMDR and somatic approaches to help survivors heal and thrive.", immediateAvailable: false, freeConsultation: false, yearsExperience: 7, languages: ["Arabic", "English"] },
  ];

  for (const d of doctorData) {
    const passwordHash = await hashPassword("doctor123");
    const email = `${d.lastName.toLowerCase()}@esaal.com`;
    const [user] = await db.insert(usersTable).values({
      firstName: d.firstName,
      lastName: d.lastName,
      email,
      passwordHash,
      role: "doctor",
      isEmailVerified: true,
    }).returning();

    const [doctor] = await db.insert(doctorsTable).values({
      userId: user.id,
      specialty: [d.specialty],
      type: d.type as "psychiatrist" | "psychologist",
      sessionType: d.sessionType as "individual" | "group" | "both",
      gender: d.gender as "male" | "female",
      price: d.price,
      rating: d.rating,
      reviewCount: d.reviewCount,
      bio: d.bio,
      isOnline: Math.random() > 0.5,
      immediateAvailable: d.immediateAvailable,
      freeConsultation: d.freeConsultation,
      yearsExperience: d.yearsExperience,
      languages: d.languages,
      isApproved: true,
    }).returning();

    const now = new Date();
    const slots = [];
    for (let i = 1; i <= 5; i++) {
      const start = new Date(now);
      start.setDate(now.getDate() + i);
      start.setHours(10 + (i % 4), 0, 0, 0);
      const end = new Date(start);
      end.setHours(start.getHours() + 1);
      slots.push({ doctorId: doctor.id, startTime: start, endTime: end });
    }
    await db.insert(slotsTable).values(slots);
  }

  const patientHash = await hashPassword("patient123");
  await db.insert(usersTable).values({
    firstName: "Test",
    lastName: "Patient",
    email: "patient@esaal.com",
    passwordHash: patientHash,
    phone: "01012345678",
    role: "patient",
    isEmailVerified: true,
  });

  logger.info("Seeding complete");
}
