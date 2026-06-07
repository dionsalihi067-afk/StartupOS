/** Static product content reused by the landing page and dashboard. */

export interface AgentInfo {
  key: string;
  name: string;
  role: string;
  icon: string; // lucide icon name
}

export const AGENTS: AgentInfo[] = [
  { key: "brand", name: "Brand Agent", role: "Names, slogan, positioning & verbal identity", icon: "Sparkles" },
  { key: "design", name: "Design Agent", role: "Color palette, typography & brand guidelines", icon: "Palette" },
  { key: "logo", name: "Logo Agent", role: "Real, unique AI-generated logo & app icon", icon: "Sparkles" },
  { key: "website", name: "Website Agent", role: "Full multi-page site with conversion copy", icon: "LayoutTemplate" },
  { key: "landing", name: "Landing Page Agent", role: "High-converting landing sections", icon: "MousePointerClick" },
  { key: "marketing", name: "Marketing Agent", role: "Strategy, Instagram, Facebook & LinkedIn creatives", icon: "Megaphone" },
  { key: "email", name: "Email Agent", role: "Welcome, follow-up, sales & re-engagement emails", icon: "Mail" },
  { key: "whatsapp", name: "WhatsApp Agent", role: "Greeting, FAQ, qualification & booking flows", icon: "MessageCircle" },
  { key: "competitor", name: "Competitor Agent", role: "Real competitor discovery via live web search", icon: "Crosshair" },
  { key: "market", name: "Market Research Agent", role: "Real market trends & demand, with citations", icon: "Search" },
  { key: "pricing", name: "Pricing Agent", role: "Pricing, revenue model & profit projection", icon: "Tags" },
  { key: "growth", name: "Growth Agent", role: "30 / 60 / 90-day growth playbooks", icon: "TrendingUp" },
  { key: "seo", name: "SEO Agent", role: "Metadata, keywords & structured data", icon: "Search" },
  { key: "publisher", name: "Publisher Agent", role: "Assembles the final business package", icon: "PackageCheck" },
];

export const OUTPUTS: string[] = [
  "Business Name",
  "Business Slogan",
  "Business Description",
  "Logo",
  "Brand Identity",
  "Color Palette",
  "Typography System",
  "Brand Guidelines",
  "Brand Story",
  "Website",
  "Landing Page",
  "Homepage Copy",
  "About Page",
  "Services Page",
  "Pricing Page",
  "FAQ Page",
  "Contact Page",
  "SEO Structure",
  "10 Instagram Posts",
  "5 Facebook Ads",
  "5 LinkedIn Posts",
  "10 Content Ideas",
  "Email Campaign",
  "WhatsApp Flows",
  "Marketing Strategy",
  "Pricing Strategy",
  "Revenue Model",
  "Profit Projection",
  "Competitor Analysis",
  "Local Competitors",
  "Customer Persona",
  "Sales Funnel",
  "Content Strategy",
  "Launch Plan",
  "30-Day Growth Plan",
  "60-Day Growth Plan",
  "90-Day Growth Plan",
];

export interface ModuleInfo {
  key: string;
  label: string;
  href: string;
  icon: string;
  group: "main" | "centers" | "system";
}

export const MODULES: ModuleInfo[] = [
  { key: "overview", label: "Overview", href: "/dashboard", icon: "LayoutDashboard", group: "main" },
  { key: "generate", label: "Startup Generator", href: "/dashboard/generate", icon: "Wand2", group: "main" },
  { key: "projects", label: "Projects", href: "/dashboard/projects", icon: "FolderKanban", group: "main" },
  { key: "brand", label: "Brand Center", href: "/dashboard/brand", icon: "Sparkles", group: "centers" },
  { key: "website", label: "Website Center", href: "/dashboard/website", icon: "LayoutTemplate", group: "centers" },
  { key: "marketing", label: "Marketing Center", href: "/dashboard/marketing", icon: "Megaphone", group: "centers" },
  { key: "competitors", label: "Competitor Intelligence", href: "/dashboard/competitors", icon: "Crosshair", group: "centers" },
  { key: "growth", label: "Growth Center", href: "/dashboard/growth", icon: "TrendingUp", group: "centers" },
  { key: "launch", label: "Launch Center", href: "/dashboard/launch", icon: "Rocket", group: "centers" },
  { key: "settings", label: "Settings", href: "/dashboard/settings", icon: "Settings", group: "system" },
];
