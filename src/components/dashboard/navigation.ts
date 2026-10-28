import {
  BarChart3,
  Globe,
  Home,
  LayoutGrid,
  Megaphone,
  Palette,
  Rocket,
  Settings,
  Tag,
  Telescope,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import type { SectionKey } from "@/lib/client/insights";
import type { MessageKey } from "@/i18n/messages";

export interface NavItem {
  key: string;
  labelKey: MessageKey;
  icon: LucideIcon;
  href: string;
}

export const BUSINESS_NAV: { key: SectionKey; labelKey: MessageKey; icon: LucideIcon }[] = [
  { key: "overview", labelKey: "navigation.overview", icon: LayoutGrid },
  { key: "brand", labelKey: "navigation.brand", icon: Palette },
  { key: "website", labelKey: "navigation.website", icon: Globe },
  { key: "marketing", labelKey: "navigation.marketing", icon: Megaphone },
  { key: "competitors", labelKey: "navigation.competitors", icon: Telescope },
  { key: "pricing", labelKey: "navigation.pricing", icon: Tag },
  { key: "growth", labelKey: "navigation.growth", icon: TrendingUp },
  { key: "launch", labelKey: "navigation.launch", icon: Rocket },
];

export const HOME_NAV: NavItem = { key: "home", labelKey: "navigation.home", icon: Home, href: "/dashboard" };
export const BUSINESSES_NAV: NavItem = {
  key: "businesses",
  labelKey: "navigation.allBusinesses",
  icon: BarChart3,
  href: "/dashboard/projects",
};
export const SETTINGS_NAV: NavItem = { key: "settings", labelKey: "navigation.settings", icon: Settings, href: "/dashboard/settings" };

const TITLES: Record<string, MessageKey> = {
  "/dashboard": "navigation.home",
  "/dashboard/projects": "navigation.allBusinesses",
  "/dashboard/generate": "navigation.newBusiness",
  "/dashboard/settings": "navigation.settings",
  "/dashboard/brand": "navigation.brand",
  "/dashboard/website": "navigation.website",
  "/dashboard/marketing": "navigation.marketing",
  "/dashboard/competitors": "navigation.competitors",
  "/dashboard/pricing": "navigation.pricing",
  "/dashboard/growth": "navigation.growth",
  "/dashboard/launch": "navigation.launch",
};

/**
 * Page title key for the top bar, and whether the page belongs to the active business.
 * `pathname` is locale-free (see `usePathname` in `@/i18n/navigation`).
 */
export function routeInfo(pathname: string): { titleKey: MessageKey | null; businessScoped: boolean } {
  if (pathname.startsWith("/dashboard/projects/")) return { titleKey: "navigation.workspace", businessScoped: true };
  const titleKey = TITLES[pathname] ?? null;
  const businessScoped = BUSINESS_NAV.some((n) => n.key !== "overview" && pathname === `/dashboard/${n.key}`);
  return { titleKey, businessScoped };
}
