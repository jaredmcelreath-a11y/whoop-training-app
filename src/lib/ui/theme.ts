/**
 * The app's two color themes. This module is the source of truth for the palettes;
 * src/app/globals.css declares the same values (a test keeps them identical).
 */
export type Theme = "dark" | "espresso";

export const THEMES: readonly Theme[] = ["dark", "espresso"];
export const THEME_LABEL: Record<Theme, string> = { dark: "Dark", espresso: "Espresso" };
export const THEME_STORAGE_KEY = "theme";

export const TOKENS = [
  "bg",
  "glow",
  "card",
  "card2",
  "line",
  "text",
  "sub",
  "accent",
  "good",
  "caution",
  "low",
  "info",
  "sleep",
  "on-accent",
] as const;
export type Token = (typeof TOKENS)[number];

export const PALETTES: Record<Theme, Record<Token, string>> = {
  dark: {
    bg: "#0b0e12",
    glow: "#0f3b2a",
    card: "rgba(255,255,255,.04)",
    card2: "rgba(255,255,255,.07)",
    line: "rgba(255,255,255,.08)",
    text: "#e9edf2",
    sub: "#9aa5b3",
    accent: "#7ff0bd",
    good: "#2fd08a",
    caution: "#f2c14e",
    low: "#f0646a",
    info: "#5aa9ff",
    sleep: "#9a8cff",
    "on-accent": "#04140d",
  },
  espresso: {
    bg: "#1e1712",
    glow: "#3b4a3a",
    card: "rgba(255,240,225,.05)",
    card2: "rgba(255,240,225,.08)",
    line: "rgba(255,235,215,.10)",
    text: "#f3ebe2",
    sub: "#c2b1a2",
    accent: "#a8dcbc",
    good: "#9fd8b5",
    caution: "#e8c48a",
    low: "#d98a6c",
    info: "#9bb8c9",
    sleep: "#b7a6d6",
    "on-accent": "#1e1712",
  },
};

export function resolveTheme(stored: string | null | undefined): Theme {
  return (THEMES as readonly string[]).includes(stored ?? "") ? (stored as Theme) : "dark";
}

export const themeColor = (t: Theme): string => PALETTES[t].bg;

/**
 * Runs in <head> before first paint: applies the stored theme and the matching browser
 * bar color. Any failure (blocked storage, old browser) leaves the page in Dark.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var c=${JSON.stringify(
  Object.fromEntries(THEMES.map((t) => [t, PALETTES[t].bg])),
)};if(!c[t])return;document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",c[t]);}catch(e){}})();`;

type Rgba = [number, number, number, number];

function parse(color: string): Rgba {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = color.match(/^rgba?\(([^)]+)\)$/);
  if (rgba) {
    const [r, g, b, a = "1"] = rgba[1].split(",").map((s) => s.trim());
    return [Number(r), Number(g), Number(b), Number(a)];
  }
  throw new RangeError(`Unsupported color: ${color}`);
}

/** Alpha-composites `color` over the opaque `base`. */
function flatten(color: string, base: string): [number, number, number] {
  const [r, g, b, a] = parse(color);
  const [br, bg, bb] = parse(base);
  return [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a)];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast of `fg` on `bg`, with translucent colors composited over the opaque `base`. */
export function contrastRatio(fg: string, bg: string, base: string): number {
  const back = flatten(bg, base);
  const front = flatten(fg, `#${back.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`);
  const [hi, lo] = [luminance(front), luminance(back)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
