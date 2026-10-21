import { z } from "zod";

const schema = z.object({
  WHOOP_CLIENT_ID: z.string().min(1),
  WHOOP_CLIENT_SECRET: z.string().min(1),
  WHOOP_REDIRECT_URI: z.string().min(1),
  APP_PASSWORD_HASH: z.string().regex(
    /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/,
    "must be a bcrypt hash (in .env, escape each $ as \\$)",
  ),
  SESSION_SECRET: z.string().min(32),
  TOKEN_ENC_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, {
      message: "must be base64 encoding of exactly 32 bytes",
    }),
  CRON_SECRET: z.string().min(1),
  INGEST_TOKEN: z.string().min(32),
  DATABASE_URL: z.string().min(1).optional(),
  OWNER_TZ: z.string().min(1).default("America/Chicago"),
});

export type Env = z.infer<typeof schema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`,
    );
    throw new Error(`Invalid environment:\n${lines.join("\n")}`);
  }
  return result.data;
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Test helper: clears the cached env. */
export function resetEnvCache(): void {
  cached = undefined;
}
