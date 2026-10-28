import type { BusinessPackage } from "@/lib/types";
import { clip } from "@/lib/website/model";

/** A single, isolated brand change. Editing one field never touches the others. */
export type BrandEdit =
  | { field: "name" | "slogan" | "description"; value: string }
  | { field: "personality"; value: string[] }
  | { field: "color"; index: number; hex: string };

const SITE_NAME_MAX = 80;

/**
 * Keeps the draft website's name in step with a brand rename. A site name the user
 * customised (anything other than the previous brand name) is left alone, and only
 * the name fields change; the live published snapshot is untouched until republish.
 */
function renameWebsite(website: BusinessPackage["website"], previousName: string, nextName: string): BusinessPackage["website"] {
  const spec = website.spec;
  if (!spec || spec.siteName !== clip(previousName, SITE_NAME_MAX)) return website;
  const siteName = clip(nextName, SITE_NAME_MAX);
  return {
    ...website,
    spec: { ...spec, siteName },
    footerColumns: website.footerColumns.map((column) => (column.title === spec.siteName ? { ...column, title: siteName } : column)),
  };
}

export function applyBrandEdit(pkg: BusinessPackage, edit: BrandEdit): BusinessPackage | "invalidIndex" | "invalidValue" {
  const brand = pkg.brand;
  switch (edit.field) {
    case "name": {
      const value = edit.value.trim();
      if (!value) return "invalidValue";
      return { ...pkg, brand: { ...brand, name: value }, website: renameWebsite(pkg.website, brand.name, value) };
    }
    case "slogan":
    case "description": {
      const value = edit.value.trim();
      if (!value) return "invalidValue";
      return { ...pkg, brand: { ...brand, [edit.field]: value } };
    }
    case "personality": {
      const value = edit.value.map((v) => v.trim()).filter(Boolean);
      return { ...pkg, brand: { ...brand, personality: value } };
    }
    case "color": {
      if (!Number.isInteger(edit.index) || edit.index < 0 || edit.index >= brand.palette.length) return "invalidIndex";
      if (!/^#[0-9a-fA-F]{6}$/.test(edit.hex)) return "invalidValue";
      const palette = brand.palette.map((c, i) => (i === edit.index ? { ...c, hex: edit.hex.toUpperCase() } : c));
      return { ...pkg, brand: { ...brand, palette } };
    }
  }
}
