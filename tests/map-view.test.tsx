// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import L from "leaflet";
import { useState } from "react";
import MapView, { type MapViewRequest } from "../src/components/MapView";
import { MapLayerPicker } from "../src/components/MapLayerPicker";
import {
  PreferencesProvider,
  usePreferences,
} from "../src/hooks/usePreferences";
import { defaultSettings, mergeSettings } from "../src/lib/preferences";
import {
  mapLayers,
  mapPreferenceKey,
  mapViewportKey,
  readMapViewport,
  resolveMapLayer,
} from "../src/lib/maps";
import * as storage from "../src/lib/storage";

vi.mock("../src/lib/storage", () => ({
  readSettings: vi.fn(),
  writeSettings: vi.fn(),
}));
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);
vi.stubGlobal("matchMedia", () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
}));
let stored = defaultSettings(["it-IT"], true);
let map: L.Map;
let tile: L.TileLayer;
const fallback = vi.fn();
const request: MapViewRequest = { id: 1, center: { lat: 43, lng: 11 } };
function Harness({
  visible = true,
  target = null,
  picker = false,
}: {
  visible?: boolean;
  target?: MapViewRequest | null;
  picker?: boolean;
}) {
  const { ready, settings, save } = usePreferences();
  if (!ready) return null;
  return (
    <>
      <button
        onClick={() =>
          void save({
            preferences: {
              theme: "dark",
              language: "en",
              distanceUnit: "imperial",
            },
          })
        }
      >
        Preferences
      </button>
      <button
        onClick={() => void save({ preferences: { mapLayer: "street" } })}
      >
        Street
      </button>
      {picker && (
        <MapLayerPicker
          selected={settings.preferences.mapLayer}
          onSelect={(id) => void save({ preferences: { mapLayer: id } })}
          onClose={() => {}}
        />
      )}
      <MapView
        baseLayer={resolveMapLayer(settings.preferences.mapLayer)}
        onFallback={fallback}
        fix={null}
        car={null}
        finds={[]}
        request={target}
        picking={false}
        onPick={() => {}}
        onFind={() => {}}
        visible={visible}
      />
    </>
  );
}
function mount(props: Parameters<typeof Harness>[0] = {}) {
  return render(
    <PreferencesProvider>
      <Harness {...props} />
    </PreferencesProvider>,
  );
}
beforeEach(() => {
  localStorage.clear();
  stored = defaultSettings(["it-IT"], true);
  vi.mocked(storage.readSettings).mockImplementation(async () => stored);
  vi.mocked(storage.writeSettings).mockImplementation(
    async (patch) => (stored = mergeSettings(stored, patch)),
  );
  const originalMap = L.map;
  vi.spyOn(L, "map").mockImplementation(
    (...args) => (map = originalMap(...args)),
  );
  const originalTile = L.tileLayer;
  vi.spyOn(L, "tileLayer").mockImplementation(
    (...args) => (tile = originalTile(...args)),
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(360);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(460);
  fallback.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("keeps the Leaflet instance and one scale/zoom control when preferences change", async () => {
  mount();
  await screen.findByRole("button", { name: "Preferences" });
  await waitFor(() =>
    expect(
      document.querySelector(".leaflet-control-scale")?.textContent,
    ).toMatch(/m/),
  );
  fireEvent.click(screen.getByText("Preferences"));
  await waitFor(() =>
    expect(
      document.querySelector(".leaflet-control-scale")?.textContent,
    ).toMatch(/ft|mi/),
  );
  expect(L.map).toHaveBeenCalledTimes(1);
  expect(document.querySelectorAll(".leaflet-control-scale")).toHaveLength(1);
  expect(document.querySelectorAll(".leaflet-control-zoom")).toHaveLength(1);
  expect(document.documentElement.dataset.theme).toBe("dark");
});
it("changes tiles, preserves centre/zoom and persists the preferred layer", async () => {
  const mounted = mount();
  await screen.findByText("Street");
  await waitFor(() =>
    expect(document.querySelector(".leaflet-control-scale")).not.toBeNull(),
  );
  act(() => {
    map.setView([44, 12], 9);
  });
  const oldTile = tile;
  fireEvent.click(screen.getByText("Street"));
  await waitFor(() => expect(stored.preferences.mapLayer).toBe("street"));
  expect(L.map).toHaveBeenCalledTimes(1);
  expect(map.hasLayer(oldTile)).toBe(false);
  expect(map.getZoom()).toBe(9);
  expect(map.getCenter().lat).toBeCloseTo(44);
  expect(
    document.querySelector(".leaflet-control-attribution")?.textContent,
  ).toContain("OpenStreetMap");
  mounted.unmount();
  mount();
  await screen.findByText("Street");
  await waitFor(() =>
    expect(document.querySelector(".leaflet-control-scale")).not.toBeNull(),
  );
  expect(map.getZoom()).toBe(9);
  expect(map.getCenter().lat).toBeCloseTo(44);
  expect(map.hasLayer(tile)).toBe(true);
  expect(stored.preferences.mapLayer).toBe("street");
});
it("restores viewport but lets explicit centring win and never replays it on tab return", async () => {
  localStorage.setItem(
    mapViewportKey,
    JSON.stringify({ lat: 45, lng: 10, zoom: 8 }),
  );
  const mounted = mount();
  await screen.findByText("Street");
  await waitFor(() =>
    expect(document.querySelector(".leaflet-control-scale")).not.toBeNull(),
  );
  expect(map.getZoom()).toBe(8);
  mounted.rerender(
    <PreferencesProvider>
      <Harness target={request} />
    </PreferencesProvider>,
  );
  expect(map.getZoom()).toBe(16);
  expect(map.getCenter().lat).toBe(43);
  act(() => {
    map.setView([46, 13], 10);
  });
  mounted.rerender(
    <PreferencesProvider>
      <Harness target={request} visible={false} />
    </PreferencesProvider>,
  );
  mounted.rerender(
    <PreferencesProvider>
      <Harness target={request} visible />
    </PreferencesProvider>,
  );
  expect(map.getCenter().lat).toBeCloseTo(46, 3);
  expect(map.getZoom()).toBe(10);
  expect(readMapViewport()?.lat).toBeCloseTo(46, 3);
  expect(readMapViewport()?.zoom).toBe(10);
});
it("falls back once after a failed tile batch and detaches tile listeners on unmount", async () => {
  const mounted = mount();
  await screen.findByText("Street");
  await waitFor(() =>
    expect(document.querySelector(".leaflet-control-scale")).not.toBeNull(),
  );
  act(() => {
    tile.fire("tileerror", { tile: document.createElement("img") });
    tile.fire("load");
    tile.fire("load");
  });
  expect(fallback).toHaveBeenCalledTimes(1);
  mounted.unmount();
  expect(tile.listens("tileerror")).toBe(false);
});
it("does not fall back for a single missing tile when others load, reports street failure once", async () => {
  mount();
  await screen.findByText("Street");
  await waitFor(() =>
    expect(document.querySelector(".leaflet-control-scale")).not.toBeNull(),
  );
  act(() => {
    tile.fire("tileerror", { tile: document.createElement("img") });
    tile.fire("tileload");
    tile.fire("load");
  });
  expect(fallback).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Street"));
  await waitFor(() => expect(stored.preferences.mapLayer).toBe("street"));
  act(() => {
    tile.fire("tileerror", { tile: document.createElement("img") });
    tile.fire("load");
  });
  expect(fallback).toHaveBeenCalledTimes(1);
  act(() => {
    tile.fire("load");
  });
  expect(fallback).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Riprova mappa" })).toBeTruthy();
});
it("shows four accessible layer choices with unavailable providers disabled", async () => {
  mount({ picker: true });
  await screen.findByRole("region", { name: "Scegli la mappa" });
  for (const layer of mapLayers) {
    const button = screen.getByRole("button", {
      name: new RegExp(`^${layer.name}`),
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(!layer.url);
    expect(button.getAttribute("aria-pressed")).toBe(
      String(layer.id === "topo"),
    );
  }
});
it("recovers the legacy preferred layer and rejects invalid viewport storage", () => {
  localStorage.setItem(mapPreferenceKey, "satellite");
  expect(defaultSettings(["it-IT"], true).preferences.mapLayer).toBe(
    "satellite",
  );
  expect(
    resolveMapLayer(
      "satellite",
      mapLayers.filter((l) => l.id !== "satellite"),
    ).id,
  ).toBe("topo");
  for (const value of [
    "broken",
    '{"lat":91,"lng":0,"zoom":5}',
    '{"lat":43,"lng":11,"zoom":100}',
  ]) {
    localStorage.setItem(mapViewportKey, value);
    expect(readMapViewport()).toBeNull();
  }
});

it("closes the layer panel with Escape or outside click and restores trigger focus", async () => {
  function Panel() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button aria-controls="map-layer-panel" onClick={() => setOpen(true)}>
          Layers
        </button>
        <button>Outside</button>
        {open && (
          <MapLayerPicker
            selected="topo"
            onSelect={() => {}}
            onClose={() => setOpen(false)}
          />
        )}
      </>
    );
  }
  render(
    <PreferencesProvider>
      <Panel />
    </PreferencesProvider>,
  );
  const trigger = screen.getByText("Layers");
  act(() => {
    trigger.focus();
  });
  fireEvent.click(trigger);
  await screen.findByRole("region", { name: "Scegli la mappa" });
  expect(document.activeElement?.getAttribute("aria-pressed")).toBe("true");
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(screen.queryByRole("region")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger);
  fireEvent.pointerDown(screen.getByText("Outside"));
  expect(screen.queryByRole("region")).toBeNull();
});
