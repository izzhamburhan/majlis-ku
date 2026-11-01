import { z } from "zod";
import { klLocalToUtc } from "@/lib/dates";

/** Empty form fields become null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null);

const optionalHttpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => value === "" || /^https?:\/\//i.test(value), { message: "Must start with http:// or https://" })
  .refine((value) => value === "" || URL.canParse(value), { message: "Invalid URL" })
  .transform((value) => (value === "" ? null : value))
  .optional()
  .transform((value) => value ?? null);

export const EVENT_TYPES = ["WEDDING", "BIRTHDAY", "CORPORATE", "PARTY", "OTHER"] as const;

export const eventFormSchema = z
  .object({
    type: z.enum(EVENT_TYPES),
    title: z.string().trim().min(1).max(120),
    hostNames: z.string().trim().min(1).max(120),
    startsAtLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    venueName: optionalText(160),
    venueAddress: optionalText(300),
    googleMapsUrl: optionalHttpUrl,
    wazeUrl: optionalHttpUrl,
    welcomeText: optionalText(500),
    themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })
  .transform(({ startsAtLocal, ...rest }) => ({ ...rest, startsAt: klLocalToUtc(startsAtLocal) }));

export type EventFormInput = z.output<typeof eventFormSchema>;

export const eventSettingsSchema = z.object({
  galleryVisibility: z.enum(["PRIVATE", "GUESTS"]),
  requireApproval: z
    .union([z.literal("on"), z.literal("true"), z.boolean()])
    .optional()
    .transform((value) => value === "on" || value === "true" || value === true),
  pin: z
    .string()
    .trim()
    .refine((value) => value === "" || /^\d{4,8}$/.test(value), { message: "PIN must be 4 to 8 digits" })
    .optional()
    .transform((value) => (value ? value : null)),
  // Disposable-camera mode. Empty = unlimited.
  shotsPerGuest: z
    .string()
    .trim()
    .refine((value) => value === "" || (/^\d{1,3}$/.test(value) && Number(value) >= 1 && Number(value) <= 100), {
      message: "Shots per guest must be 1 to 100",
    })
    .optional()
    .transform((value) => (value ? Number(value) : null)),
});

export type EventSettingsInput = z.output<typeof eventSettingsSchema>;

/** FormData to a plain object for Zod (single values only). */
export function formToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}