"use client";

import * as React from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "pms.theme";

const ThemeContext = React.createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}>({ theme: "light", setTheme: () => {}, toggle: () => {} });

/**
 * Runs before first paint so the stored theme is already stamped on <html> and
 * the page never flashes the wrong surface.
 *
 * Light is the default: the OS preference is deliberately not consulted, so a
 * first-time visitor on a dark-mode machine still lands on the light theme.
 * Dark remains one click away and, once chosen, persists.
 */
export const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var theme = stored === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();
`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>("light");

  React.useEffect(() => {
    const current = (document.documentElement.dataset.theme as Theme) ?? "light";
    setThemeState(current);
  }, []);

  const setTheme = React.useCallback((next: Theme) => {
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode — the choice just won't survive a reload.
    }
    setThemeState(next);
  }, []);

  const value = React.useMemo(
    () => ({
      theme,
      setTheme,
      toggle: () => setTheme(theme === "dark" ? "light" : "dark"),
    }),
    [theme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return React.useContext(ThemeContext);
}
