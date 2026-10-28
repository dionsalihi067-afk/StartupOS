import type { BusinessInput } from "@/lib/types";
import type { GenerationContext } from "@/lib/agents/context";

type ContentLanguage = "sq" | "en" | "both" | undefined;

function discoveryLanguage(input: BusinessInput | GenerationContext): ContentLanguage {
  const discovery = "input" in input ? input.input.discovery : input.discovery;
  return discovery?.brand.language;
}

/**
 * Human language name for LLM instructions from discovery brand.language.
 * `both` is not collapsed to English — prompts request bilingual deliverables.
 */
export function outputLanguageName(input: BusinessInput | GenerationContext): string {
  const lang = discoveryLanguage(input);
  if (lang === "sq") return "Albanian";
  if (lang === "both") return "Albanian and English";
  return "English";
}

/** Compact instruction line for every customer-facing generation prompt. */
export function languageInstruction(input: BusinessInput | GenerationContext): string {
  const lang = discoveryLanguage(input);
  if (lang === "both") {
    return "Write customer-facing text in both Albanian and English where the schema allows parallel fields; otherwise write clear Albanian first with an English line immediately after. Keep brand names and proper nouns unchanged. Do not invent a third language.";
  }
  return `Write all customer-facing text in ${outputLanguageName(input)}. Keep brand names, product names, and proper nouns unchanged. Do not mix languages.`;
}
