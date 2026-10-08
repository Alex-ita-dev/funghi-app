import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { readSettings, writeSettings } from "../lib/storage";
import {
  defaultSettings,
  mergeSettings,
  type SettingsPatch,
  type UserSettings,
} from "../lib/preferences";
import { translator } from "../lib/i18n";
import {
  formatDate,
  formatDateTime,
  formatDistance,
  formatAltitude,
} from "../lib/units";

type Value = {
  settings: UserSettings;
  ready: boolean;
  error: boolean;
  saving: boolean;
  save: (patch: SettingsPatch) => Promise<void>;
};
const Context = createContext<Value | null>(null);
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(() =>
    defaultSettings(navigator.languages, false),
  );
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const tail = useRef(Promise.resolve());
  const revision = useRef(0);
  useEffect(() => {
    let alive = true;
    void readSettings(navigator.languages)
      .then((value) => {
        if (alive) {
          setSettings(value);
          setReady(true);
        }
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  const save = useCallback((patch: SettingsPatch) => {
    const seq = ++revision.current;
    setSettings((current) =>
      mergeSettings(current, {
        ...patch,
        onboardingCompleted: current.onboardingCompleted,
      }),
    );
    setSaving(true);
    const operation = tail.current
      .then(() => writeSettings(patch))
      .then((value) => {
        if (seq === revision.current) {
          setSettings(value);
          setSaving(false);
          setError(false);
        }
      })
      .catch((error) => {
        setError(true);
        setSaving(false);
        throw error;
      });
    tail.current = operation.catch(() => {});
    return operation;
  }, []);
  const { theme, language } = settings.preferences;
  useEffect(() => {
    const query = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && query.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", dark ? "#14231d" : "#214c3b");
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = `MycoTrail — ${translator(language)("Il bosco, a modo tuo.")}`;
  }, [language]);
  return (
    <Context.Provider value={{ settings, ready, error, saving, save }}>
      {children}
    </Context.Provider>
  );
}
export function usePreferences() {
  const value = useContext(Context);
  if (!value) throw new Error("PreferencesProvider missing");
  const p = value.settings.preferences;
  const tr = useMemo(() => translator(p.language), [p.language]);
  return {
    ...value,
    tr,
    metres: (m: number) => formatDistance(m, p),
    altitude: (m: number) => formatAltitude(m, p),
    dateLabel: (t: number) => formatDate(t, p),
    dateTime: (t: number) => formatDateTime(t, p),
  };
}
