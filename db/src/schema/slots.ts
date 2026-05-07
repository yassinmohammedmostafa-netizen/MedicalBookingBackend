import { pgTable, integer, boolean, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const slotsTable = pgTable("slots", {
  id: serial("id").primaryKey(),
  doctorId: integer("doctor_id").notNull(),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  isBooked: boolean("is_booked").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSlotSchema = createInsertSchema(slotsTable).omit({ id: true, createdAt: true, isBooked: true });
export type InsertSlot = z.infer<typeof insertSlotSchema>;
export type Slot = typeof slotsTable.$inferSelect;
