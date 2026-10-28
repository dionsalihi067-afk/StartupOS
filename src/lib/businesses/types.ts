import type { BusinessPackage } from "@/lib/types";

export type BusinessStatus = "generating" | "ready" | "failed";

/** Why a business has no usable package. Mapped to `businessErrors.*` in the interface. */
export type BusinessErrorCode = "generationFailed" | "interrupted" | "invalidData";

/** Safe, lightweight shape returned by list endpoints. Never includes owner ids. */
export interface BusinessSummary {
  id: string;
  status: BusinessStatus;
  name: string | null;
  slogan: string | null;
  idea: string;
  location: string;
  iconUrl: string | null;
  launchDone: number;
  launchTotal: number;
  errorCode: BusinessErrorCode | null;
  createdAt: string;
  updatedAt: string;
  /** Server revision; increases by one on every write, so it orders responses reliably. */
  version: number;
}

export interface BusinessDetail extends BusinessSummary {
  package: BusinessPackage | null;
}

export type ImportResultStatus = "imported" | "duplicate" | "invalid" | "failed";

export interface ImportResult {
  legacyId: string;
  status: ImportResultStatus;
  businessId: string | null;
}
