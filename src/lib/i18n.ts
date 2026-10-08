import { dictionaries } from "../locales";
import { detectLanguage, type Language } from "./preferences";

export type Translator = (
  key: string,
  values?: Record<string, string | number>,
) => string;
export function translator(language: string): Translator {
  const locale: Language = detectLanguage([language]);
  return (key, values = {}) => {
    const catalogue: Record<string, string> = dictionaries[locale];
    const fallback: Record<string, string> = dictionaries.en;
    return (catalogue[key] ?? fallback[key] ?? key).replace(
      /\{\{(\w+)\}\}/g,
      (match, name: string) => String(values[name] ?? match),
    );
  };
}
