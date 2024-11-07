import {boolean, char, date, integer, json, pgTable, smallint, text, timestamp, varchar} from "drizzle-orm/pg-core";


export const usersTable = pgTable("users", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar({ length: 255 }).notNull(),
  age: integer().notNull(),
  email: varchar({ length: 255 }).notNull().unique(),
});

export const userPostTable = pgTable("userPost", {
  uid: char({ length: 10 }).notNull(),
  forumId: integer().notNull(),
  forumName: varchar({ length: 32 }).notNull(),
  title: varchar({ length: 48 }).notNull(),
  threadId: varchar({ length: 12 }).notNull(),
  postId: varchar({ length: 12 }).primaryKey().notNull(),
  createTime: timestamp().notNull(),
  affiliated: boolean().notNull(),
  content: text().notNull(),
  replyTo: varchar({ length: 32 }),
  pgRecordTime: date().defaultNow().notNull(),
});

export const postTable = pgTable("post", {
  id: varchar({ length: 12 }).primaryKey().notNull(),
  floor: integer().notNull(),
  time: timestamp().notNull(),
  content: text(),
  subPostNumber: smallint(),
  authorId: char({ length: 10 }).notNull(),
  ipAddress: varchar({ length: 8 }),
  agreeNum: smallint(),
  disagreeNum: smallint(),
  pgRecordTime: date().defaultNow().notNull(),
});

export const subPostTable = pgTable("subPost", {
  postId: varchar({ length: 12 }).notNull(),
  id: varchar({ length: 12 }).primaryKey().notNull(),
  time: timestamp().notNull(),
  content: text().notNull(),
  authorId: char({ length: 10 }).notNull(),
  otherId: char({ length: 10 }),
  otherName: varchar({ length: 16 }),
  pgRecordTime: date().defaultNow().notNull(),
});
