import { z } from "zod";

export const languages = ["it", "en", "de", "es", "fr", "pt"] as const;
export type Language = (typeof languages)[number];
export const languageNames: Record<Language, string> = {
  it: "Italiano",
  en: "English",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
  pt: "Português",
};
export const countries = [
  "IT",
  "DE",
  "ES",
  "FR",
  "PT",
  "GB",
  "IE",
  "US",
  "CA",
  "AT",
  "CH",
  "BE",
  "NL",
  "PL",
  "CZ",
  "SI",
  "HR",
  "RO",
  "OTHER",
] as const;
export type Country = (typeof countries)[number];
export const preferencesSchema = z.object({
  language: z.enum(languages),
  country: z.enum(countries),
  theme: z.enum(["system", "light", "dark"]),
  measurementSystem: z.enum(["metric", "imperial", "custom"]),
  temperatureUnit: z.enum(["C", "F"]),
  distanceUnit: z.enum(["metric", "imperial"]),
  altitudeUnit: z.enum(["m", "ft"]),
  weightUnit: z.enum(["metric", "imperial"]),
  precipitationUnit: z.enum(["mm", "in"]),
  dateFormat: z.enum(["DMY", "MDY", "ISO"]),
  timeFormat: z.enum(["24", "12"]),
});
export type Preferences = z.infer<typeof preferencesSchema>;
export const profileSchema = z.object({
  nickname: z.string().trim().max(40),
  searchMode: z.enum(["mushrooms", "truffles", "both"]),
  // Stable, extensible IDs; not an enum of today's catalogue.
  favouriteSpecies: z.array(z.string().min(1).max(80)).max(100),
  experience: z.enum(["beginner", "intermediate", "expert"]),
});
export type Profile = z.infer<typeof profileSchema>;
export const settingsSchema = z.object({
  version: z.literal(1),
  preferences: preferencesSchema,
  profile: profileSchema,
  onboardingCompleted: z.boolean(),
  existingInstallation: z.boolean(),
});
export type UserSettings = z.infer<typeof settingsSchema>;
export type SettingsPatch = {
  preferences?: Partial<Preferences>;
  profile?: Partial<Profile>;
  onboardingCompleted?: boolean;
};
export function detectLanguage(locales: readonly string[]): Language {
  for (const locale of locales) {
    const language = locale.toLowerCase().split(/[-_]/)[0];
    if (languages.includes(language as Language)) return language as Language;
  }
  return "en";
}
export function detectCountry(locales: readonly string[]): Country {
  for (const locale of locales) {
    try {
      const region = new Intl.Locale(locale).region;
      if (region && countries.includes(region as Country))
        return region as Country;
    } catch {
      /* Ignore malformed browser locales. */
    }
  }
  return "OTHER";
}
export function systemPreset(
  system: "metric" | "imperial",
): Pick<
  Preferences,
  | "measurementSystem"
  | "temperatureUnit"
  | "distanceUnit"
  | "altitudeUnit"
  | "weightUnit"
  | "precipitationUnit"
> {
  const imperial = system === "imperial";
  return {
    measurementSystem: system,
    temperatureUnit: imperial ? "F" : "C",
    distanceUnit: system,
    altitudeUnit: imperial ? "ft" : "m",
    weightUnit: system,
    precipitationUnit: imperial ? "in" : "mm",
  };
}
export function countryPreset(country: Country): Omit<Preferences, "theme"> {
  const language: Language =
    (
      {
        IT: "it",
        DE: "de",
        AT: "de",
        CH: "de",
        ES: "es",
        FR: "fr",
        BE: "fr",
        PT: "pt",
      } as Partial<Record<Country, Language>>
    )[country] ?? "en";
  return {
    ...systemPreset(country === "US" ? "imperial" : "metric"),
    country,
    language,
    // UK outdoor default: miles for distance, metres for height, Celsius.
    ...(country === "GB"
      ? {
          measurementSystem: "custom" as const,
          distanceUnit: "imperial" as const,
        }
      : {}),
    dateFormat: country === "US" ? "MDY" : country === "CA" ? "ISO" : "DMY",
    timeFormat: country === "US" ? "12" : "24",
  };
}
export function defaultSettings(
  locales: readonly string[],
  existingInstallation: boolean,
): UserSettings {
  return {
    version: 1,
    preferences: {
      ...countryPreset(detectCountry(locales)),
      language: detectLanguage(locales),
      theme: "system",
    },
    profile: {
      nickname: "",
      searchMode: "mushrooms",
      favouriteSpecies: [],
      experience: "beginner",
    },
    onboardingCompleted: false,
    existingInstallation,
  };
}
export function mergeSettings(
  current: UserSettings,
  patch: SettingsPatch,
): UserSettings {
  return settingsSchema.parse({
    ...current,
    ...patch,
    preferences: { ...current.preferences, ...patch.preferences },
    profile: { ...current.profile, ...patch.profile },
  });
}
export const needsOnboarding = (settings: UserSettings) =>
  !settings.onboardingCompleted && !settings.existingInstallation;

export const species = [
  { id: "boletus-edulis-group", group: "mushrooms", name: "Porcini" },
  { id: "cantharellus", group: "mushrooms", name: "Galletti / Finferli" },
  { id: "amanita-caesarea", group: "mushrooms", name: "Ovuli" },
  { id: "macrolepiota-procera", group: "mushrooms", name: "Mazze di tamburo" },
  { id: "tricholoma-terreum", group: "mushrooms", name: "Morette" },
  { id: "calocybe-gambosa", group: "mushrooms", name: "Prugnoli" },
  { id: "morchella", group: "mushrooms", name: "Spugnole" },
  { id: "mushrooms-other", group: "mushrooms", name: "Altri funghi" },
  { id: "tuber-magnatum", group: "truffles", name: "Tartufo bianco" },
  {
    id: "tuber-melanosporum",
    group: "truffles",
    name: "Tartufo nero pregiato",
  },
  { id: "tuber-aestivum", group: "truffles", name: "Scorzone" },
  { id: "tuber-uncinatum", group: "truffles", name: "Uncinato" },
  { id: "tuber-borchii", group: "truffles", name: "Bianchetto" },
  { id: "truffles-other", group: "truffles", name: "Altri tartufi" },
] as const;
