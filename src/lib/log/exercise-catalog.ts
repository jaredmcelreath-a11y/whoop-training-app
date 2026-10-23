export type Category = "strength" | "bodyweight" | "plyo" | "core" | "mobility";

/** Big multi-joint lifts take the heavier rep range; single-joint ones the lighter (strength.repRange). */
export type Pattern = "compound" | "isolation";

/** Picker labels; the stored values stay lowercase. */
export const CATEGORY_LABEL: Record<Category, string> = {
  strength: "Strength",
  bodyweight: "Bodyweight",
  plyo: "Plyometrics",
  core: "Core",
  mobility: "Mobility",
};

export const DEFAULT_EXERCISES: { name: string; category: Category; pattern: Pattern | null }[] = [
  { name: "Lat Pulldown", category: "strength", pattern: "compound" },
  { name: "Seated Row", category: "strength", pattern: "compound" },
  { name: "Machine Reverse Fly", category: "strength", pattern: "isolation" },
  { name: "Machine Bicep Curl", category: "strength", pattern: "isolation" },
  { name: "Cable Bicep Curl", category: "strength", pattern: "isolation" },
  { name: "Machine Chest Press", category: "strength", pattern: "compound" },
  { name: "Seated Dip Machine", category: "strength", pattern: "compound" },
  { name: "Dip", category: "bodyweight", pattern: null },
  { name: "Machine Shoulder Press", category: "strength", pattern: "compound" },
  { name: "Dumbbell Lateral Raise", category: "strength", pattern: "isolation" },
  { name: "Rope Triceps Pulldown", category: "strength", pattern: "isolation" },
  { name: "Leg Press", category: "strength", pattern: "compound" },
  { name: "Seated Leg Extension", category: "strength", pattern: "isolation" },
  { name: "Seated Leg Curl", category: "strength", pattern: "isolation" },
  { name: "Groin Adductor Machine", category: "strength", pattern: "isolation" },
  { name: "Glute Abductor Machine", category: "strength", pattern: "isolation" },
  { name: "Machine Calf Press", category: "strength", pattern: "isolation" },
  { name: "Barbell Front Squat", category: "strength", pattern: "compound" },
  { name: "Barbell Deadlift", category: "strength", pattern: "compound" },
  { name: "Dumbbell Alternating Lunge", category: "strength", pattern: "compound" },
  { name: "Box Jump", category: "plyo", pattern: null },
  { name: "Tibialis Raise", category: "bodyweight", pattern: null },
  { name: "Straight-Knee Calf Raise", category: "bodyweight", pattern: null },
  { name: "Bent-Knee Calf Raise", category: "bodyweight", pattern: null },
  { name: "Plank", category: "core", pattern: null },
  { name: "Dead Bug", category: "core", pattern: null },
];

// Whole words only: "pressdown" is not a press and "narrow" is not a row.
const GUESSES: [RegExp, Category, Pattern | null][] = [
  [/\b(plank|dead bug|crunch|sit-?up|hollow|pallof)/, "core", null],
  [/\b(jumps?|bounds?|hops?|plyo\w*|throws?|slams?)\b/, "plyo", null],
  [/\b(stretch\w*|mobility|yoga|foam)\b/, "mobility", null],
  [/\b(push-?ups?|pull-?ups?|chin-?ups?|bodyweight)\b/, "bodyweight", null],
  [/\b(pressdowns?|pushdowns?)\b/, "strength", "isolation"],
  [/\b(press|row|pulldown|squat|deadlift|lunge|dip)s?\b/, "strength", "compound"],
];

/**
 * An exercise's category and pattern: the default catalog's when the name is in it (any case),
 * otherwise a keyword guess the owner can change. Anything unrecognised is an isolation lift.
 */
export function classifyExercise(name: string): { category: Category; pattern: Pattern | null } {
  const key = name.trim().toLowerCase();
  const known = DEFAULT_EXERCISES.find((e) => e.name.toLowerCase() === key);
  if (known) return { category: known.category, pattern: known.pattern };
  for (const [re, category, pattern] of GUESSES) if (re.test(key)) return { category, pattern };
  return { category: "strength", pattern: "isolation" };
}
