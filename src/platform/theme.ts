import { useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const storageKey = "med.theme";

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== "system") return preference;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }
  return "dark";
}

function readPreference(): ThemePreference {
  const stored = localStorage.getItem(storageKey);
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    resolveTheme(readPreference()),
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      const next = resolveTheme(preference);
      setResolved(next);
      document.documentElement.dataset.theme = next;
      document.documentElement.dataset.themePreference = preference;
      document.documentElement.style.colorScheme = next;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);

  const setPreference = (next: ThemePreference) => {
    localStorage.setItem(storageKey, next);
    setPreferenceState(next);
  };

  return { preference, resolved, setPreference };
}
