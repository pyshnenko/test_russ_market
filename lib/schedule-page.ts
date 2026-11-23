import "server-only";
import { z } from "zod";
import { readSchedulePage } from "./repository";

export const schedulePageSchema = z.object({
  query: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).max(5000).default(1),
});

export const loadSchedulePage = readSchedulePage;
