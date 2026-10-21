import bcrypt from "bcryptjs";
import { getEnv } from "@/lib/env";

/**
 * Config errors (missing/malformed APP_PASSWORD_HASH) propagate as exceptions
 * so a broken deployment is distinguishable from a wrong password.
 */
export async function verifyPassword(plain: string): Promise<boolean> {
  const hash = getEnv().APP_PASSWORD_HASH;
  return bcrypt.compare(plain, hash);
}
