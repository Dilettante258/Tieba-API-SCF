import { pgSchema } from "drizzle-orm/pg-core";

export const appDbSchemaName = process.env.DB_SCHEMA ?? "eazy_tieba";
export const appDbSchema = pgSchema(appDbSchemaName);
