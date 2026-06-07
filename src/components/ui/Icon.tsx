import * as React from "react";
import {
  Sparkles,
  Palette,
  LayoutTemplate,
  MousePointerClick,
  Megaphone,
  Mail,
  MessageCircle,
  Crosshair,
  Tags,
  TrendingUp,
  Search,
  PackageCheck,
  LayoutDashboard,
  Wand2,
  FolderKanban,
  Rocket,
  Settings,
  type LucideIcon,
} from "lucide-react";

const REGISTRY: Record<string, LucideIcon> = {
  Sparkles,
  Palette,
  LayoutTemplate,
  MousePointerClick,
  Megaphone,
  Mail,
  MessageCircle,
  Crosshair,
  Tags,
  TrendingUp,
  Search,
  PackageCheck,
  LayoutDashboard,
  Wand2,
  FolderKanban,
  Rocket,
  Settings,
};

export function Icon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  const Cmp = REGISTRY[name] ?? Sparkles;
  return <Cmp size={size} className={className} />;
}
