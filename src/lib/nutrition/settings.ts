import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { nutritionSettings } from "@/db/schema";

export type NutritionSettings = {
  refProfile: "male_19_30" | "female_19_30" | "male_31_50" | "female_31_50" | null;
  mealsPerDay: number;
  waterSource: "app" | "cronometer" | "both";
  supplements: {
    name: string;
    timing: "morning" | "with_meal" | "pre_workout" | "post_workout" | "evening";
  }[];
  gainGoalLb: number;
  gainStartWeightLb: number | null;
};

export const MAX_SUPPLEMENTS = 20;
const MAX_SUPPLEMENT_NAME = 60;
const MAX_MEALS_PER_DAY = 10;

export const NutritionSettingsInput = z.object({
  refProfile: z.enum(["male_19_30", "female_19_30", "male_31_50", "female_31_50"]).nullable(),
  mealsPerDay: z.number().int().min(1).max(MAX_MEALS_PER_DAY),
  waterSource: z.enum(["app", "cronometer", "both"]),
  supplements: z
    .array(
      z.object({
        name: z
          .string()
          .trim()
          .min(1, "Supplement name is required")
          .max(MAX_SUPPLEMENT_NAME, `Supplement names are at most ${MAX_SUPPLEMENT_NAME} characters`),
        timing: z.enum(["morning", "with_meal", "pre_workout", "post_workout", "evening"]),
      }),
    )
    .max(MAX_SUPPLEMENTS, `At most ${MAX_SUPPLEMENTS} supplements`),
  gainGoalLb: z.number().positive(),
  gainStartWeightLb: z.number().positive().nullable(),
});

function toSettings(r: typeof nutritionSettings.$inferSelect): NutritionSettings {
  return {
    refProfile: r.refProfile,
    mealsPerDay: r.mealsPerDay,
    waterSource: r.waterSource,
    supplements: r.supplements,
    gainGoalLb: r.gainGoalLb,
    gainStartWeightLb: r.gainStartWeightLb,
  };
}

export async function getNutritionSettings(db: Db): Promise<NutritionSettings> {
  await db.insert(nutritionSettings).values({ id: 1 }).onConflictDoNothing({
    target: nutritionSettings.id,
  });
  const [row] = await db.select().from(nutritionSettings).where(eq(nutritionSettings.id, 1));
  return toSettings(row);
}

export async function updateNutritionSettings(
  db: Db,
  patch: Partial<NutritionSettings>,
): Promise<NutritionSettings> {
  const [row] = await db.select().from(nutritionSettings).where(eq(nutritionSettings.id, 1));
  if (!row) throw new Error("Nutrition settings have not been created yet");
  const parsed = NutritionSettingsInput.safeParse({ ...toSettings(row), ...patch });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const [updated] = await db
    .update(nutritionSettings)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(nutritionSettings.id, 1))
    .returning();
  return toSettings(updated);
}
