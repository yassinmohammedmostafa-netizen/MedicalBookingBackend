import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const doctorsTable = sqliteTable("doctors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  specialty: text("specialty", { mode: "json" }).$type<string[]>().notNull().default([]),
  subspecialty: text("subspecialty"),
  type: text("type").notNull().default("psychiatrist"),
  sessionType: text("session_type").notNull().default("individual"),
  gender: text("gender").notNull().default("male"),
  price: integer("price").notNull().default(0),
  rating: real("rating").notNull().default(0),
  reviewCount: integer("review_count").notNull().default(0),
  bio: text("bio"),
  isOnline: integer("is_online", { mode: "boolean" }).notNull().default(false),
  immediateAvailable: integer("immediate_available", { mode: "boolean" }).notNull().default(false),
  freeConsultation: integer("free_consultation", { mode: "boolean" }).notNull().default(false),
  yearsExperience: integer("years_experience"),
  languages: text("languages", { mode: "json" }).$type<string[]>().notNull().default(["Arabic"]),
  avatarUrl: text("avatar_url"),
  isApproved: integer("is_approved", { mode: "boolean" }).notNull().default(false),
  
  // Pending changes requiring admin approval
  pendingBio: text("pending_bio"),
  pendingPrice: integer("pending_price"),
  pendingSpecialty: text("pending_specialty", { mode: "json" }).$type<string[]>(),
  pendingLanguages: text("pending_languages", { mode: "json" }).$type<string[]>(),
  pendingGender: text("pending_gender"),
  paymentInfo: text("payment_info"),
  pendingPaymentInfo: text("pending_payment_info"),
  pendingAvatarUrl: text("pending_avatar_url"),
  isRejected: integer("is_rejected", { mode: "boolean" }),
  rejectionReason: text("rejection_reason"),
  priceChangedByAdmin: integer("price_changed_by_admin", { mode: "boolean" }).default(false),
  
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().defaultNow(),
});

export const insertDoctorSchema = createInsertSchema(doctorsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDoctor = z.infer<typeof insertDoctorSchema>;
export type Doctor = typeof doctorsTable.$inferSelect;
