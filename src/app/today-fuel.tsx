import Link from "next/link";
import type { Db } from "@/db/client";
import { localDate } from "@/lib/log/dates";
import { confidenceNote, fuelNeeds, ozLabel, syncedLabel } from "@/lib/nutrition/fuel-view";
import { getDayNutrition, type DayNutrition } from "@/lib/nutrition/service";
import { getNutritionSettings, type NutritionSettings } from "@/lib/nutrition/settings";
import { Cap, Card, Meter } from "@/components/ui/ui";
import styles from "./today.module.css";
import { WaterButton } from "./water-button";

/** "Today's fuel": calories, protein, carbs and water against target. Never breaks the page. */
export async function TodayFuel({ db, now, tz }: { db: Db; now: Date; tz: string }) {
  let n: DayNutrition;
  let waterSource: NutritionSettings["waterSource"];
  try {
    n = await getDayNutrition(db, localDate(now, tz), now, tz);
    waterSource = (await getNutritionSettings(db)).waterSource;
  } catch (err) {
    console.error("getDayNutrition failed:", err);
    return (
      <Card>
        <Cap>Fuel So Far</Cap>
        <p className={styles.small}>Couldn&apos;t load today&apos;s fuel</p>
      </Card>
    );
  }

  const t = n.targets;
  const e = n.eaten;
  const needs = fuelNeeds(n.needs);
  const note = confidenceNote(n.confidence, t !== null);

  return (
    <Card>
      <Cap>Fuel So Far</Cap>
      {t ? (
        <>
          <Bar label="Calories" value={e?.kcal ?? null} target={t.kcal} unit="kcal" />
          <Bar label="Protein" value={e?.proteinG ?? null} target={t.proteinG} unit="g" />
          <Bar label="Carbs" value={e?.carbsG ?? null} target={t.carbsG} unit="g" />
        </>
      ) : (
        <p className={styles.small}>No targets yet. Finish setup below.</p>
      )}
      <div className={styles.barRow}>
        <div className={styles.barHead}>
          <span>Water</span>
          <span>{ozLabel(n.water.countedMl, n.water.targetMl)}</span>
        </div>
        <Meter value={n.water.countedMl} max={n.water.targetMl} tone="info" label="Water" />
      </div>
      {waterSource !== "cronometer" ? <WaterButton /> : <p className={styles.small}>Water is counted from Cronometer.</p>}
      <p className={styles.small}>{syncedLabel(n.lastSyncedAt, tz)}</p>
      {note ? <p className={styles.small}>{note}</p> : null}
      {needs.length ? (
        <ul className={styles.needs}>
          {needs.map((x) => (
            <li key={x.text}>
              <Link href={x.href} className={styles.whyLink}>
                {x.text}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function Bar({ label, value, target, unit }: { label: string; value: number | null; target: number; unit: string }) {
  return (
    <div className={styles.barRow}>
      <div className={styles.barHead}>
        <span>{label}</span>
        <span className={styles.barNums}>
          {value === null ? "–" : Math.round(value)} / {Math.round(target)} {unit}
        </span>
      </div>
      <Meter value={value ?? 0} max={target} tone={label === "Calories" ? "accent" : "good"} label={label} />
    </div>
  );
}
