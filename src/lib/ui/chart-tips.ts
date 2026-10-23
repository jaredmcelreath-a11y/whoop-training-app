/** What happened to a chart dot or its popup. `mouse` marks a click from a mouse, which already opened it on hover. */
export type TipAction =
  | { type: "enter"; i: number }
  | { type: "leave" }
  | { type: "tap"; i: number; mouse?: boolean }
  | { type: "close" };

/** Which dot's popup is open after `action`: hover opens, a tap toggles, tapping the popup closes. */
export function tipAfter(open: number | null, action: TipAction): number | null {
  switch (action.type) {
    case "enter":
      return action.i;
    case "tap":
      return action.mouse || open !== action.i ? action.i : null;
    default:
      return null;
  }
}

/** Fraction of the width near each edge where the popup lines up with the dot instead of centring. */
const EDGE = 0.25;
/** Dots this close to the top open their popup underneath. */
const TOP = 0.3;

/** Where a dot at (x, y) in a width × height viewBox sits, and which way its popup opens. */
export function tipPlacement(x: number, y: number, width: number, height: number) {
  const fx = x / width;
  const fy = y / height;
  return {
    leftPct: fx * 100,
    topPct: fy * 100,
    align: fx < EDGE ? ("start" as const) : fx > 1 - EDGE ? ("end" as const) : ("center" as const),
    below: fy < TOP,
  };
}
