import Link from "next/link";
import type { Db } from "@/db/client";
import { confidenceNote, fuelNeeds, fuelRows, syncedLabel, type FuelRow } from "@/lib/nutrition/fuel-view";
import { getDayNutrition, type DayNutrition } from "@/lib/nutrition/service";
import { getNutritionSettings, type NutritionSettings } from "@/lib/nutrition/settings";
import { Icon } from "@/components/icon";
import { Cap, Card, Meter } from "@/components/ui/ui";
import styles from "./today.module.css";
import { WaterButton } from "./water-button";

/** "Today's fuel": calories, protein, carbs and water against target. Never breaks the page. */
export async function TodayFuel({
  db,
  date,
  now,
  tz,
  past,
}: {
  db: Db;
  date: string;
  now: Date;
  tz: string;
  past: boolean;
}) {
  let n: DayNutrition;
  let waterSource: NutritionSettings["waterSource"];
  try {
    n = await getDayNutrition(db, date, now, tz);
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

  const rows = fuelRows(t, e, n.water);

  return (
    <Card>
      {/* The bars open the all-nutrients page; buttons and setup links stay outside the link. */}
      <Link href="/fuel" className={styles.fuelLink} aria-label="Fuel so far: see all nutrients">
        <div className={styles.fuelHead}>
          <Cap>Fuel So Far</Cap>
          <span className={styles.seeAll}>
            All Nutrients <Icon name="chevron-right" size={14} />
          </span>
        </div>
        {rows.map((r) => (
          <Bar key={r.label} {...r} />
        ))}
        {t ? null : <p className={styles.small}>No food targets yet. Finish setup below.</p>}
      </Link>
      {past ? null : waterSource !== "cronometer" ? (
        <WaterButton />
      ) : (
        <p className={styles.small}>Water is counted from Cronometer.</p>
      )}
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

function Bar({ label, value, target, unit }: FuelRow) {
  const shown = (x: number | null) => (x === null ? "–" : Math.round(x));
  return (
    <div className={styles.barRow}>
      <div className={styles.barHead}>
        <span>{label}</span>
        <span className={styles.barNums}>
          {shown(value)}
          {target === null ? "" : ` / ${Math.round(target)}`} {unit}
        </span>
      </div>
      <Meter
        value={value ?? 0}
        max={target ?? 0}
        tone={label === "Water" ? "info" : label === "Calories" ? "accent" : "good"}
        label={label}
      />
    </div>
  );
}
