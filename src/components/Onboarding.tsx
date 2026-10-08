import { useEffect, useId, useRef, useState } from "react";
import { Brand } from "./Brand";
import {
  countries,
  countryPreset,
  languages,
  languageNames,
  species,
  type Country,
  type Profile,
  type Preferences,
} from "../lib/preferences";
import { translator } from "../lib/i18n";
import { usePreferences } from "../hooks/usePreferences";
import { countryName, SettingSelect } from "./PreferencesSettings";

export function Onboarding({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel?: () => void;
}) {
  const { settings, save } = usePreferences();
  const [profile, setProfile] = useState(settings.profile);
  const [preferences, setPreferences] = useState(settings.preferences);
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const nicknameId = useId();
  const tr = translator(preferences.language);
  const titles = [
    "Benvenuto in MycoTrail",
    "Come ti chiami?",
    "Da dove vieni?",
    "Cosa cerchi nel bosco?",
    "Cosa cerchi più spesso?",
    "Livello esperienza",
    "MycoTrail è pronto.",
  ];
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  const change = (patch: Partial<Profile>) =>
    setProfile((current) => ({ ...current, ...patch }));
  async function finish() {
    setPending(true);
    setError(false);
    try {
      await save({ preferences, profile, onboardingCompleted: true });
      onDone();
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="onboarding" lang={preferences.language}>
      <div className="onboarding-card">
        <Brand compact />
        <div
          className="onboarding-progress"
          aria-label={tr("Passaggio {{step}} di {{total}}", {
            step: step + 1,
            total: titles.length,
          })}
        >
          {titles.map((_, i) => (
            <span key={i} className={i <= step ? "done" : ""} />
          ))}
        </div>
        <p className="mini-label">
          {tr("Passaggio {{step}} di {{total}}", {
            step: step + 1,
            total: titles.length,
          })}
        </p>
        <h1 ref={heading} tabIndex={-1}>
          {tr(titles[step])}
        </h1>
        {step === 0 && (
          <>
            <p className="onboarding-tagline">{tr("Il bosco, a modo tuo.")}</p>
            <p>
              {tr(
                "Tracce, ritrovamenti e strumenti outdoor, sempre nel tuo taccuino.",
              )}
            </p>
            <SettingSelect
              label={tr("Lingua")}
              value={preferences.language}
              options={languages.map((code) => [code, languageNames[code]])}
              onChange={(language) =>
                setPreferences((p) => ({
                  ...p,
                  language: language as Preferences["language"],
                }))
              }
            />
          </>
        )}
        {step === 1 && (
          <div className="field">
            <label htmlFor={nicknameId}>{tr("Nome o nickname")}</label>
            <input
              id={nicknameId}
              aria-describedby={`${nicknameId}-hint`}
              maxLength={40}
              autoComplete="nickname"
              value={profile.nickname}
              onChange={(e) => change({ nickname: e.target.value })}
            />
            <span id={`${nicknameId}-hint`}>
              {tr("Puoi usare un nickname o lasciare il campo vuoto.")}
            </span>
          </div>
        )}
        {step === 2 && (
          <>
            <SettingSelect
              label={tr("Paese")}
              value={preferences.country}
              options={countries.map((code) => [
                code,
                countryName(code, preferences.language, tr("Altro")),
              ])}
              onChange={(country) =>
                setPreferences((p) => ({
                  ...p,
                  ...countryPreset(country as Country),
                }))
              }
            />
            <SettingSelect
              label={tr("Lingua")}
              value={preferences.language}
              options={languages.map((code) => [code, languageNames[code]])}
              onChange={(language) =>
                setPreferences((p) => ({
                  ...p,
                  language: language as Preferences["language"],
                }))
              }
            />
            <p>
              {tr("Potrai modificare tutto in seguito dalle Impostazioni.")}
            </p>
          </>
        )}
        {step === 3 && (
          <div
            className="profile-choices"
            role="group"
            aria-label={tr(titles[step])}
          >
            {(
              [
                ["mushrooms", "🍄", "Funghi"],
                ["truffles", "🟤", "Tartufi"],
                ["both", "🌲", "Entrambi"],
              ] as const
            ).map(([value, icon, label]) => (
              <button
                key={value}
                className="choice-button"
                aria-pressed={profile.searchMode === value}
                onClick={() => change({ searchMode: value })}
              >
                <span aria-hidden="true">{icon}</span>
                {tr(label)}
              </button>
            ))}
          </div>
        )}
        {step === 4 && (
          <>
            <div className="species-choices">
              {species
                .filter(
                  (s) =>
                    profile.searchMode === "both" ||
                    profile.searchMode === s.group,
                )
                .map((s) => (
                  <label key={s.id}>
                    <input
                      type="checkbox"
                      checked={profile.favouriteSpecies.includes(s.id)}
                      onChange={(e) =>
                        change({
                          favouriteSpecies: e.target.checked
                            ? [...profile.favouriteSpecies, s.id]
                            : profile.favouriteSpecies.filter(
                                (id) => id !== s.id,
                              ),
                        })
                      }
                    />
                    <span>{tr(s.name)}</span>
                  </label>
                ))}
            </div>
            <button className="text-button" onClick={() => setStep(5)}>
              {tr("Salta")}
            </button>
          </>
        )}
        {step === 5 && (
          <div
            className="profile-choices"
            role="group"
            aria-label={tr(titles[step])}
          >
            {(
              [
                ["beginner", "Principiante"],
                ["intermediate", "Intermedio"],
                ["expert", "Esperto"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className="choice-button"
                aria-pressed={profile.experience === value}
                onClick={() => change({ experience: value })}
              >
                {tr(label)}
              </button>
            ))}
          </div>
        )}
        {step === 6 && (
          <>
            <dl className="profile-summary">
              <dt>{tr("Nome o nickname")}</dt>
              <dd>{profile.nickname || "—"}</dd>
              <dt>{tr("Paese")}</dt>
              <dd>
                {countryName(
                  preferences.country,
                  preferences.language,
                  tr("Altro"),
                )}
              </dd>
              <dt>{tr("Lingua")}</dt>
              <dd>{languageNames[preferences.language]}</dd>
              <dt>{tr("Profilo di ricerca")}</dt>
              <dd>
                {tr(
                  {
                    mushrooms: "Funghi",
                    truffles: "Tartufi",
                    both: "Entrambi",
                  }[profile.searchMode],
                )}
              </dd>
              <dt>{tr("Specie preferite")}</dt>
              <dd>
                {profile.favouriteSpecies
                  .map((id) => tr(species.find((s) => s.id === id)?.name ?? id))
                  .join(", ") || "—"}
              </dd>
              <dt>{tr("Livello esperienza")}</dt>
              <dd>
                {tr(
                  {
                    beginner: "Principiante",
                    intermediate: "Intermedio",
                    expert: "Esperto",
                  }[profile.experience],
                )}
              </dd>
            </dl>
            <p>
              {tr(
                "La configurazione modifica solo preferenze e profilo. Punti e percorsi restano intatti.",
              )}
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="inline-error">
            {tr("Preferenze non salvate. Riprova prima di chiudere.")}
          </p>
        )}
        <div className="onboarding-actions">
          {step > 0 && (
            <button
              disabled={pending}
              className="button secondary"
              onClick={() => setStep(step - 1)}
            >
              {tr("Indietro")}
            </button>
          )}
          <button
            disabled={pending}
            className="button primary"
            onClick={() => (step === 6 ? void finish() : setStep(step + 1))}
          >
            {pending
              ? tr("Salvataggio…")
              : tr(
                  step === 6
                    ? "Entra nel bosco"
                    : step === 0
                      ? "Inizia"
                      : "Continua",
                )}
          </button>
        </div>
        {onCancel && (
          <button disabled={pending} className="text-button" onClick={onCancel}>
            {tr("Annulla")}
          </button>
        )}
      </div>
    </main>
  );
}
