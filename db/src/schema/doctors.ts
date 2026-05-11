import { pgTable, text, integer, boolean, timestamp, serial, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const doctorsTable = pgTable("doctors", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  specialty: jsonb("specialty").$type<string[]>().notNull().default([]),
  subspecialty: text("subspecialty"),
  type: text("type").notNull().default("psychiatrist"),
  sessionType: text("session_type").notNull().default("individual"),
  gender: text("gender").notNull().default("male"),
  price: integer("price").notNull().default(0),
  rating: real("rating").notNull().default(0),
  reviewCount: integer("review_count").notNull().default(0),
  bio: text("bio"),
  isOnline: boolean("is_online").notNull().default(false),
  freeConsultation: boolean("free_consultation").notNull().default(false),
  yearsExperience: integer("years_experience"),
  languages: jsonb("languages").$type<string[]>().notNull().default(["Arabic"]),
  avatarUrl: text("avatar_url"),
  isApproved: boolean("is_approved").notNull().default(false),
  
  pendingBio: text("pending_bio"),
  pendingPrice: integer("pending_price"),
  pendingSpecialty: jsonb("pending_specialty").$type<string[]>(),
  pendingLanguages: jsonb("pending_languages").$type<string[]>(),
  pendingGender: text("pending_gender"),
  paymentInfo: text("payment_info"),
  pendingPaymentInfo: text("pending_payment_info"),
  pendingAvatarUrl: text("pending_avatar_url"),
  isRejected: boolean("is_rejected"),
  rejectionReason: text("rejection_reason"),
  priceChangedByAdmin: boolean("price_changed_by_admin").default(false),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDoctorSchema = createInsertSchema(doctorsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDoctor = typeof doctorsTable.$inferInsert;
export type Doctor = typeof doctorsTable.$inferSelect;
