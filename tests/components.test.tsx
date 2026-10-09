// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import {
  PreferencesProvider,
  usePreferences,
} from "../src/hooks/usePreferences";
import { PreferencesSettings } from "../src/components/PreferencesSettings";
import { Onboarding } from "../src/components/Onboarding";
import { defaultSettings } from "../src/lib/preferences";
import * as storage from "../src/lib/storage";
import App from "../src/App";
import { emptyData } from "../src/lib/model";

// jsdom has no layout/canvas: only the map renderer is replaced. Journal,
// GPS hook, dialogs, settings, persistence and all React flows run normally.
vi.mock("../src/components/MapView", () => ({
  default: () => <div data-testid="map-renderer" />,
}));
Object.assign(HTMLDialogElement.prototype, {
  showModal() {
    this.setAttribute("open", "");
  },
  close() {
    this.removeAttribute("open");
  },
});

const media = new EventTarget() as EventTarget & {
  matches: boolean;
  media: string;
};
Object.assign(media, { matches: false, media: "(prefers-color-scheme: dark)" });
vi.stubGlobal("matchMedia", () => media);
vi.stubGlobal("indexedDB", new IDBFactory());
Object.defineProperty(navigator, "languages", {
  value: ["it-IT"],
  configurable: true,
});
function Harness({ onboarding = false }: { onboarding?: boolean }) {
  const { ready, settings, error } = usePreferences();
  if (!ready) return <p>loading</p>;
  return (
    <>
      {onboarding && !settings.onboardingCompleted ? (
        <Onboarding onDone={() => {}} />
      ) : (
        <PreferencesSettings onProfile={() => {}}>
          <p>journal</p>
        </PreferencesSettings>
      )}
      <output data-testid="settings">{JSON.stringify(settings)}</output>
      <output data-testid="failed">{String(error)}</output>
    </>
  );
}
beforeEach(async () => {
  // Keep the connection alive but reset only test records between cases.
  await storage.readSettings(["it-IT"]);
  await new Promise<void>((resolve, reject) => {
    const r = indexedDB.open("mycotrail", 1);
    r.onsuccess = () => {
      const tx = r.result.transaction("data", "readwrite");
      tx.objectStore("data").delete("main");
      tx.objectStore("data").put(defaultSettings(["it-IT"], false), "settings");
      tx.oncomplete = () => {
        r.result.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
  media.matches = false;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("React settings and onboarding", () => {
  it("completes all steps, saves species/profile and stays complete after remount", async () => {
    const user = userEvent.setup();
    const mounted = render(
      <PreferencesProvider>
        <Harness onboarding />
      </PreferencesProvider>,
    );
    await screen.findByRole("heading", { name: "Benvenuto in MycoTrail" });
    await user.click(screen.getByRole("button", { name: "Inizia" }));
    await user.type(screen.getByLabelText("Nome o nickname"), "Castagno");
    await user.click(screen.getByRole("button", { name: "Continua" }));
    await user.selectOptions(screen.getByLabelText("Paese"), "IT");
    await user.click(screen.getByRole("button", { name: "Continua" }));
    await user.click(screen.getByRole("button", { name: /Entrambi/ }));
    await user.click(screen.getByRole("button", { name: "Continua" }));
    await user.click(screen.getByLabelText("Porcini"));
    await user.click(screen.getByLabelText("Tartufo bianco"));
    await user.click(screen.getByRole("button", { name: "Continua" }));
    await user.click(screen.getByRole("button", { name: "Esperto" }));
    await user.click(screen.getByRole("button", { name: "Continua" }));
    await user.click(screen.getByRole("button", { name: "Entra nel bosco" }));
    await screen.findByRole("heading", { name: "Aspetto" });
    expect((await storage.readSettings([])).profile).toMatchObject({
      nickname: "Castagno",
      experience: "expert",
      searchMode: "both",
      favouriteSpecies: ["boletus-edulis-group", "tuber-magnatum"],
    });
    mounted.unmount();
    render(
      <PreferencesProvider>
        <Harness onboarding />
      </PreferencesProvider>,
    );
    await screen.findByRole("heading", { name: "Aspetto" });
    expect(
      screen.queryByRole("heading", { name: "Benvenuto in MycoTrail" }),
    ).toBeNull();
  });
  it("switches every language in place and persists a manual override after country preset", async () => {
    const user = userEvent.setup();
    render(
      <PreferencesProvider>
        <Harness />
      </PreferencesProvider>,
    );
    await screen.findByRole("heading", { name: "Aspetto" });
    await user.selectOptions(screen.getByLabelText("Paese"), "US");
    await screen.findByRole("heading", { name: "Appearance" });
    expect((screen.getByLabelText("Distance") as HTMLSelectElement).value).toBe(
      "imperial",
    );
    for (const [language, title] of [
      ["de", "Darstellung"],
      ["es", "Aspecto"],
      ["fr", "Apparence"],
      ["pt", "Aspeto"],
      ["it", "Aspetto"],
    ]) {
      await user.selectOptions(screen.getAllByRole("combobox")[1], language);
      await screen.findByRole("heading", { name: title });
      expect(document.documentElement.lang).toBe(language);
    }
    await waitFor(async () =>
      expect((await storage.readSettings([])).preferences).toMatchObject({
        country: "US",
        language: "it",
        distanceUnit: "imperial",
      }),
    );
  });
  it("applies explicit light/dark and responds live to system appearance", async () => {
    const user = userEvent.setup();
    render(
      <PreferencesProvider>
        <Harness />
      </PreferencesProvider>,
    );
    const select = await screen.findByLabelText("Tema");
    expect(document.documentElement.dataset.theme).toBe("light");
    await user.selectOptions(select, "dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    await user.selectOptions(select, "light");
    expect(document.documentElement.dataset.theme).toBe("light");
    await user.selectOptions(select, "system");
    act(() => {
      media.matches = true;
      media.dispatchEvent(new Event("change"));
    });
    expect(document.documentElement.dataset.theme).toBe("dark");
    act(() => {
      media.matches = false;
      media.dispatchEvent(new Event("change"));
    });
    expect(document.documentElement.dataset.theme).toBe("light");
  });
  it("keeps onboarding open on failed persistence and permits retry", async () => {
    const user = userEvent.setup();
    render(
      <PreferencesProvider>
        <Harness onboarding />
      </PreferencesProvider>,
    );
    await screen.findByRole("heading", { name: "Benvenuto in MycoTrail" });
    await user.click(screen.getByRole("button", { name: "Inizia" }));
    for (let i = 0; i < 5; i++)
      await user.click(screen.getByRole("button", { name: "Continua" }));
    const write = vi
      .spyOn(storage, "writeSettings")
      .mockRejectedValueOnce(new Error("quota"));
    await user.click(screen.getByRole("button", { name: "Entra nel bosco" }));
    await screen.findByRole("alert");
    expect((await storage.readSettings([])).onboardingCompleted).toBe(false);
    expect(
      screen.getByRole("button", { name: "Entra nel bosco" }),
    ).toBeTruthy();
    write.mockRestore();
    await user.click(screen.getByRole("button", { name: "Entra nel bosco" }));
    await screen.findByRole("heading", { name: "Aspetto" });
    expect((await storage.readSettings([])).onboardingCompleted).toBe(true);
  });
  it("cancelling a reconfiguration does not write draft changes", async () => {
    const user = userEvent.setup();
    const cancelled = vi.fn();
    function Editor() {
      const { ready } = usePreferences();
      return ready ? (
        <Onboarding onDone={() => {}} onCancel={cancelled} />
      ) : null;
    }
    render(
      <PreferencesProvider>
        <Editor />
      </PreferencesProvider>,
    );
    await screen.findByRole("heading", { name: "Benvenuto in MycoTrail" });
    await user.click(screen.getByRole("button", { name: "Inizia" }));
    fireEvent.change(screen.getByLabelText("Nome o nickname"), {
      target: { value: "Not committed" },
    });
    await user.click(screen.getByRole("button", { name: "Annulla" }));
    expect(cancelled).toHaveBeenCalledOnce();
    expect((await storage.readSettings([])).profile.nickname).toBe("");
  });
  it("discards a failed profile reconfiguration without leaking draft settings", async () => {
    const user = userEvent.setup();
    await storage.writeSettings({ onboardingCompleted: true });
    const original = await storage.readSettings([]);
    function Editor() {
      const { ready, settings } = usePreferences();
      const [editing, setEditing] = React.useState(true);
      if (!ready) return null;
      return (
        <>
          {editing && (
            <Onboarding
              onDone={() => setEditing(false)}
              onCancel={() => setEditing(false)}
            />
          )}
          <output data-testid="current-settings">
            {JSON.stringify(settings)}
          </output>
        </>
      );
    }
    render(
      <PreferencesProvider>
        <Editor />
      </PreferencesProvider>,
    );
    await screen.findByRole("heading", { name: "Benvenuto in MycoTrail" });
    await user.click(screen.getByRole("button", { name: "Inizia" }));
    await user.type(
      screen.getByLabelText("Nome o nickname"),
      "Unsaved nickname",
    );
    await user.click(screen.getByRole("button", { name: "Continua" }));
    await user.selectOptions(screen.getByLabelText("Paese"), "GB");
    for (let i = 0; i < 4; i++)
      await user.click(
        screen.getByRole("button", { name: "Continue", exact: true }),
      );
    vi.spyOn(storage, "writeSettings").mockRejectedValueOnce(
      new Error("quota"),
    );
    await user.click(
      screen.getByRole("button", { name: "Head into the forest", exact: true }),
    );
    await screen.findByRole("alert");
    await user.click(
      screen.getByRole("button", { name: "Cancel", exact: true }),
    );
    expect(
      JSON.parse(screen.getByTestId("current-settings").textContent!),
    ).toEqual(original);
    expect(await storage.readSettings([])).toEqual(original);
  });
  it("retains an active outing and GPS watch while opening and cancelling the profile editor", async () => {
    const user = userEvent.setup();
    await storage.writeSettings({ onboardingCompleted: true });
    Object.defineProperty(window, "isSecureContext", {
      value: true,
      configurable: true,
    });
    const clear = vi.fn();
    const watch = vi.fn(() => 1);
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({
            coords: {
              latitude: 43,
              longitude: 11,
              accuracy: 8,
              altitude: 10,
              altitudeAccuracy: 3,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          } as GeolocationPosition),
        watchPosition: watch,
        clearWatch: clear,
      },
    });
    render(
      <PreferencesProvider>
        <App />
      </PreferencesProvider>,
    );
    await screen.findByRole("heading", { name: "Ci vediamo nel bosco." });
    await user.click(
      screen.getByRole("button", { name: "Avvia uscita", exact: true }),
    );
    await screen.findByRole("button", { name: "Pausa", exact: true });
    await waitFor(async () =>
      expect((await storage.readData()).trips[0]?.points.length).toBe(1),
    );
    expect(watch).toHaveBeenCalledTimes(1);
    await user.click(
      within(
        screen.getByRole("navigation", { name: "Navigazione principale" }),
      ).getByRole("button", { name: "Impostazioni", exact: true }),
    );
    await user.click(
      screen.getByRole("button", { name: "Riconfigura profilo", exact: true }),
    );
    await screen.findByRole("heading", { name: "Benvenuto in MycoTrail" });
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Annulla",
        exact: true,
      }),
    );
    expect(clear).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Pausa", exact: true }),
    ).toBeTruthy();
    await user.selectOptions(
      screen.getByLabelText("Lingua", { exact: true }),
      "en",
    );
    await screen.findByRole("heading", { name: "Appearance", exact: true });
    await user.selectOptions(
      screen.getByLabelText("Theme", { exact: true }),
      "dark",
    );
    await user.selectOptions(
      screen.getByLabelText("Distance", { exact: true }),
      "imperial",
    );
    await user.click(
      within(
        screen.getByRole("navigation", { name: "Main navigation" }),
      ).getByRole("button", { name: "Explore", exact: true }),
    );
    await user.click(
      screen.getByRole("button", { name: "Choose map: Topographic" }),
    );
    await user.click(screen.getByRole("button", { name: /^Street/ }));
    await waitFor(async () =>
      expect((await storage.readSettings([])).preferences.mapLayer).toBe(
        "street",
      ),
    );
    expect(watch).toHaveBeenCalledTimes(1);
    expect(clear).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Pause", exact: true }),
    ).toBeTruthy();
  });
  it("shows the nonblocking profile prompt for an existing journal and keeps its places", async () => {
    const data = {
      ...emptyData(),
      finds: [
        {
          id: "legacy",
          kind: "spot" as const,
          title: "Posto originale",
          notes: "Privato",
          lat: 43,
          lng: 11,
          accuracy: null,
          source: "map" as const,
          createdAt: 1,
        },
      ],
    };
    await storage.writeData(data);
    await new Promise<void>((resolve) => {
      const r = indexedDB.open("mycotrail", 1);
      r.onsuccess = () => {
        const tx = r.result.transaction("data", "readwrite");
        tx.objectStore("data").delete("settings");
        tx.oncomplete = () => {
          r.result.close();
          resolve();
        };
      };
    });
    render(
      <PreferencesProvider>
        <App />
      </PreferencesProvider>,
    );
    await screen.findByRole("heading", { name: "Ci vediamo nel bosco." });
    expect(screen.getByText("Completa il tuo profilo MycoTrail")).toBeTruthy();
    expect(screen.getByText("Posto originale")).toBeTruthy();
    expect(await storage.readData()).toEqual(data);
  });
});

it("keeps an unavailable preferred provider while displaying a usable fallback", async () => {
  await storage.writeSettings({
    onboardingCompleted: true,
    preferences: { mapLayer: "satellite" },
  });
  render(
    <PreferencesProvider>
      <App />
    </PreferencesProvider>,
  );
  await screen.findByRole("button", { name: "Scegli mappa: Topografica" });
  expect(
    screen.getByText("Mappa non disponibile. Mostriamo Topografica."),
  ).toBeTruthy();
  expect((await storage.readSettings([])).preferences.mapLayer).toBe(
    "satellite",
  );
});
