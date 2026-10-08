import type { ReactNode } from "react";
import { usePreferences } from "../hooks/usePreferences";
import {
  countries,
  countryPreset,
  languages,
  languageNames,
  species,
  systemPreset,
  type Country,
  type Preferences,
} from "../lib/preferences";

export function SettingSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="setting-row">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
export function countryName(code: Country, language: string, other: string) {
  return code === "OTHER"
    ? other
    : (new Intl.DisplayNames([language], { type: "region" }).of(code) ?? code);
}
export function PreferencesSettings({
  onProfile,
  children,
}: {
  onProfile: () => void;
  children: ReactNode;
}) {
  const { settings, save, tr, saving, error, dateTime } = usePreferences();
  const p = settings.preferences;
  const update = (preferences: Partial<Preferences>) => {
    void save({ preferences }).catch(() => {});
  };
  const select = <K extends keyof Preferences>(
    key: K,
    label: string,
    options: readonly (readonly [Preferences[K], string])[],
    unit = false,
  ) => (
    <SettingSelect
      label={tr(label)}
      value={p[key]}
      options={options.map(([value, text]) => [value, tr(text)])}
      onChange={(value) =>
        update({
          [key]: value,
          ...(unit ? { measurementSystem: "custom" } : {}),
        })
      }
    />
  );
  return (
    <>
      <article className="settings-card preference-card">
        <h2>{tr("Aspetto")}</h2>
        {select("theme", "Tema", [
          ["system", "Automatico / sistema"],
          ["light", "Chiaro"],
          ["dark", "Scuro"],
        ])}
      </article>
      <article className="settings-card preference-card">
        <h2>{tr("Lingua e regione")}</h2>
        <SettingSelect
          label={tr("Lingua")}
          value={p.language}
          options={languages.map((code) => [code, languageNames[code]])}
          onChange={(language) =>
            update({ language: language as Preferences["language"] })
          }
        />
        <SettingSelect
          label={tr("Paese")}
          value={p.country}
          options={countries.map((code) => [
            code,
            countryName(code, p.language, tr("Altro")),
          ])}
          onChange={(country) => update(countryPreset(country as Country))}
        />
        <p>
          {tr("Il Paese propone lingua e unità. Puoi modificarle liberamente.")}
        </p>
        {select("dateFormat", "Formato data", [
          ["DMY", "DD/MM/YYYY"],
          ["MDY", "MM/DD/YYYY"],
          ["ISO", "YYYY-MM-DD"],
        ])}
        {select("timeFormat", "Formato ora", [
          ["24", "24 ore"],
          ["12", "12 ore AM/PM"],
        ])}
        <p className="format-preview">{dateTime(Date.now())}</p>
      </article>
      <article className="settings-card preference-card">
        <h2>{tr("Unità di misura")}</h2>
        <SettingSelect
          label={tr("Sistema di misura")}
          value={p.measurementSystem}
          options={[
            ["metric", tr("Metrico")],
            ["imperial", tr("Imperiale")],
            ["custom", tr("Personalizzato")],
          ]}
          onChange={(system) =>
            update(
              system === "custom"
                ? { measurementSystem: "custom" }
                : systemPreset(system as "metric" | "imperial"),
            )
          }
        />
        {select(
          "temperatureUnit",
          "Temperatura",
          [
            ["C", "°C"],
            ["F", "°F"],
          ],
          true,
        )}
        {select(
          "distanceUnit",
          "Distanza",
          [
            ["metric", "m / km"],
            ["imperial", "ft / mi"],
          ],
          true,
        )}
        {select(
          "altitudeUnit",
          "Quota",
          [
            ["m", "m"],
            ["ft", "ft"],
          ],
          true,
        )}
        {select(
          "weightUnit",
          "Peso",
          [
            ["metric", "g / kg"],
            ["imperial", "oz / lb"],
          ],
          true,
        )}
        {select(
          "precipitationUnit",
          "Precipitazioni",
          [
            ["mm", "mm"],
            ["in", "in"],
          ],
          true,
        )}
        <p>
          {tr(
            "Temperatura, peso e pioggia: preferenze pronte per le funzioni future.",
          )}
        </p>
      </article>
      <article className="settings-card preference-card">
        <h2>{tr("Profilo di ricerca")}</h2>
        <p>{settings.profile.nickname || tr("Il mio taccuino")}</p>
        <p>
          {tr(
            { mushrooms: "Funghi", truffles: "Tartufi", both: "Entrambi" }[
              settings.profile.searchMode
            ],
          )}{" "}
          ·{" "}
          {tr(
            {
              beginner: "Principiante",
              intermediate: "Intermedio",
              expert: "Esperto",
            }[settings.profile.experience],
          )}
        </p>
        <p>
          {tr("Specie preferite")}:{" "}
          {settings.profile.favouriteSpecies
            .map((id) => tr(species.find((s) => s.id === id)?.name ?? id))
            .join(", ") || "—"}
        </p>
        <button className="button secondary" onClick={onProfile}>
          {tr("Riconfigura profilo")}
        </button>
        <p>
          {tr(
            "La configurazione modifica solo preferenze e profilo. Punti e percorsi restano intatti.",
          )}
        </p>
      </article>
      <p className="preferences-status" role="status">
        {error
          ? tr("Preferenze non salvate. Riprova prima di chiudere.")
          : saving
            ? tr("Salvataggio…")
            : tr("Preferenze salvate sul dispositivo.")}
      </p>
      {error && (
        <button
          className="button secondary"
          onClick={() =>
            void save({ preferences: p, profile: settings.profile }).catch(
              () => {},
            )
          }
        >
          {tr("Riprova")}
        </button>
      )}
      {children}
    </>
  );
}
