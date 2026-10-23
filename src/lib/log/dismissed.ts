import { sql } from "drizzle-orm";
import { dismissedWorkouts, workouts } from "@/db/schema";

/** WHERE clause: this WHOOP workout wasn't marked as not a real workout (see dismissWorkout). */
export const notDismissed = sql`not exists (select 1 from ${dismissedWorkouts} where ${dismissedWorkouts.workoutId} = ${workouts.id})`;
