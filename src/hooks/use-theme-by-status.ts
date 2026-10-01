import { useEffect } from "react";

type FlightStatus = "hangar" | "taxiing" | "airborne" | "landed";

// Returns whether it's currently night time locally
function isNight(): boolean {
  const hour = new Date().getHours();
  return hour >= 21 || hour < 6;
}

// CSS variable sets for each theme
const themes: Record<string, Record<string, string>> = {
  // Warmes Hangar-Licht — gebürstetes Aluminium, Leder, Carbon
  hangar: {
    "--background": "oklch(0.1 0.01 60)",
    "--foreground": "oklch(0.92 0.04 80)",
    "--card": "oklch(0.15 0.015 55)",
    "--card-foreground": "oklch(0.92 0.04 80)",
    "--primary": "oklch(0.72 0.18 65)",
    "--primary-foreground": "oklch(0.1 0.01 60)",
    "--muted": "oklch(0.2 0.02 55)",
    "--muted-foreground": "oklch(0.6 0.04 70)",
    "--border": "oklch(1 0 0 / 12%)",
    "--accent": "oklch(0.72 0.18 65)",
    "--accent-foreground": "oklch(0.1 0.01 60)",
  },
  // Sonnenuntergang — warm orange-rot wenn fliegend
  airborne: {
    "--background": "oklch(0.12 0.03 35)",
    "--foreground": "oklch(0.95 0.04 75)",
    "--card": "oklch(0.17 0.04 35)",
    "--card-foreground": "oklch(0.95 0.04 75)",
    "--primary": "oklch(0.75 0.2 45)",
    "--primary-foreground": "oklch(0.1 0.01 35)",
    "--muted": "oklch(0.22 0.03 35)",
    "--muted-foreground": "oklch(0.65 0.05 60)",
    "--border": "oklch(1 0 0 / 14%)",
    "--accent": "oklch(0.75 0.2 45)",
    "--accent-foreground": "oklch(0.1 0.01 35)",
  },
  // Rollend — gedämpftes Gelb, Triebwerk läuft an
  taxiing: {
    "--background": "oklch(0.11 0.02 70)",
    "--foreground": "oklch(0.93 0.05 85)",
    "--card": "oklch(0.16 0.025 65)",
    "--card-foreground": "oklch(0.93 0.05 85)",
    "--primary": "oklch(0.82 0.18 90)",
    "--primary-foreground": "oklch(0.1 0.01 70)",
    "--muted": "oklch(0.21 0.02 65)",
    "--muted-foreground": "oklch(0.62 0.04 80)",
    "--border": "oklch(1 0 0 / 12%)",
    "--accent": "oklch(0.82 0.18 90)",
    "--accent-foreground": "oklch(0.1 0.01 70)",
  },
  // Gelandet — kühles Blau, Motor aus
  landed: {
    "--background": "oklch(0.1 0.015 240)",
    "--foreground": "oklch(0.92 0.02 220)",
    "--card": "oklch(0.14 0.02 235)",
    "--card-foreground": "oklch(0.92 0.02 220)",
    "--primary": "oklch(0.65 0.15 230)",
    "--primary-foreground": "oklch(0.1 0.01 240)",
    "--muted": "oklch(0.19 0.015 235)",
    "--muted-foreground": "oklch(0.6 0.02 220)",
    "--border": "oklch(1 0 0 / 10%)",
    "--accent": "oklch(0.65 0.15 230)",
    "--accent-foreground": "oklch(0.1 0.01 240)",
  },
  // Cockpit-Nacht — dunkles Anthrazit mit Bernstein-Instrumenten
  night: {
    "--background": "oklch(0.08 0.005 50)",
    "--foreground": "oklch(0.88 0.06 75)",
    "--card": "oklch(0.11 0.008 50)",
    "--card-foreground": "oklch(0.88 0.06 75)",
    "--primary": "oklch(0.68 0.16 60)",
    "--primary-foreground": "oklch(0.08 0.005 50)",
    "--muted": "oklch(0.15 0.008 48)",
    "--muted-foreground": "oklch(0.55 0.05 65)",
    "--border": "oklch(1 0 0 / 8%)",
    "--accent": "oklch(0.68 0.16 60)",
    "--accent-foreground": "oklch(0.08 0.005 50)",
  },
};

export function useThemeByStatus(status: FlightStatus, introPhase: string) {
  useEffect(() => {
    if (introPhase !== "done") return;

    // Night mode overrides hangar/landed
    let themeKey: string = status;
    if (isNight() && (status === "hangar" || status === "landed")) {
      themeKey = "night";
    }

    const theme = themes[themeKey] ?? themes["hangar"];
    const root = document.documentElement;

    Object.entries(theme).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    // Smooth transition via CSS
    root.style.setProperty("transition", "background-color 2s ease, color 1.5s ease");

    return () => {
      // Reset on unmount
      Object.keys(theme).forEach((key) => {
        root.style.removeProperty(key);
      });
      root.style.removeProperty("transition");
    };
  }, [status, introPhase]);
}
