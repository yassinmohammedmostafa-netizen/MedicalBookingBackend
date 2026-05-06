import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const messagesTable = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  appointmentId: integer("appointment_id").notNull(),
  senderId: integer("sender_id").notNull(),
  senderName: text("sender_name").notNull(),
  senderRole: text("sender_role").notNull(),
  content: text("content").notNull(),
  type: text("type").notNull().default("text"),
  fileUrl: text("file_url"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().defaultNow(),
});

export type Message = typeof messagesTable.$inferSelect;
