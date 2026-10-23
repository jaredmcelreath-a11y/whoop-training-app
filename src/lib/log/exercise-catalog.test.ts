import { describe, expect, it } from "vitest";
import { classifyExercise, DEFAULT_EXERCISES } from "./exercise-catalog";

describe("classifyExercise", () => {
  it("uses the default catalog, ignoring case", () => {
    expect(classifyExercise("lat pulldown")).toEqual({ category: "strength", pattern: "compound" });
    expect(classifyExercise("Dumbbell Lateral Raise")).toEqual({ category: "strength", pattern: "isolation" });
  });
  it("guesses unknown names from keywords", () => {
    expect(classifyExercise("Hack Squat")).toEqual({ category: "strength", pattern: "compound" });
    expect(classifyExercise("Cable Fly")).toEqual({ category: "strength", pattern: "isolation" });
    expect(classifyExercise("Side Plank")).toEqual({ category: "core", pattern: null });
    expect(classifyExercise("Broad Jump")).toEqual({ category: "plyo", pattern: null });
    expect(classifyExercise("Hip Mobility Flow")).toEqual({ category: "mobility", pattern: null });
    expect(classifyExercise("Pull-Up")).toEqual({ category: "bodyweight", pattern: null });
  });
  it("matches whole words, so pressdowns and narrow grips aren't big lifts", () => {
    expect(classifyExercise("Triceps Pressdown")).toEqual({ category: "strength", pattern: "isolation" });
    expect(classifyExercise("Narrow-Grip Curl")).toEqual({ category: "strength", pattern: "isolation" });
    expect(classifyExercise("Med Ball Throw")).toEqual({ category: "plyo", pattern: null });
  });
  it("gives every default strength exercise a pattern", () => {
    for (const e of DEFAULT_EXERCISES.filter((x) => x.category === "strength")) expect(e.pattern, e.name).not.toBeNull();
    for (const e of DEFAULT_EXERCISES.filter((x) => x.category !== "strength")) expect(e.pattern, e.name).toBeNull();
  });
});
