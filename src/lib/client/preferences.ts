"use client";

import * as React from "react";
import type { BusinessStyle } from "@/lib/types";
import { BUSINESS_STYLES } from "@/lib/schemas";
import { THEME_STORAGE_KEY } from "@/lib/theme-script";

/** Browser-local UI preferences. Kept separate from project data. */

export type ThemePreference = "system" | "light" | "dark";

const THEME_KEY = THEME_STORAGE_KEY;
const STYLE_KEY = "startupos.defaultStyle.v1";
const EVENT = "startupos:preferences";

export function getThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(THEME_KEY);
  return v === "light" || v === "dark" ? v : "system";
}

export function applyTheme(pref: ThemePreference): void {
  const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function setThemePreference(pref: ThemePreference): void {
  window.localStorage.setItem(THEME_KEY, pref);
  applyTheme(pref);
  window.dispatchEvent(new Event(EVENT));
}

export function getDefaultStyle(): BusinessStyle | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STYLE_KEY);
  return (BUSINESS_STYLES as readonly string[]).includes(v ?? "") ? (v as BusinessStyle) : null;
}

export function setDefaultStyle(style: BusinessStyle | null): void {
  if (style) window.localStorage.setItem(STYLE_KEY, style);
  else window.localStorage.removeItem(STYLE_KEY);
  window.dispatchEvent(new Event(EVENT));
}

/** Re-applies the theme when the OS preference changes while "system" is selected. */
export function ThemeSync() {
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (getThemePreference() === "system") applyTheme("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return null;
}

/** Reads a preference after mount; `fallback` is used for the server render. */
export function usePreference<T>(read: () => T, fallback: T): T {
  const [value, setValue] = React.useState<T>(fallback);
  React.useEffect(() => {
    const update = () => setValue(read());
    update();
    window.addEventListener(EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, [read]);
  return value;
}
