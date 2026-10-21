"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { disconnectWhoop } from "@/lib/whoop/disconnect";

export async function disconnectAction(): Promise<void> {
  if (!(await requireSession())) redirect("/login");
  await disconnectWhoop(getDb());
  redirect("/settings");
}
