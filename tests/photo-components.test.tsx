// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  render,
  screen,
  waitFor,
  cleanup,
  fireEvent,
} from "@testing-library/react";
import { PreferencesProvider } from "../src/hooks/usePreferences";
import { PhotoImage } from "../src/components/FindingPhotos";
import { FindForm } from "../src/components/FindForm";
import { defaultSettings } from "../src/lib/preferences";
import * as storage from "../src/lib/storage";
vi.mock("../src/lib/storage", () => ({
  readSettings: vi.fn(),
  writeSettings: vi.fn(),
  readPhotoBlob: vi.fn(),
  readPhotoMeta: vi.fn(),
}));
const photo = {
  id: "photo",
  findingId: "find",
  mimeType: "image/jpeg" as const,
  timestamp: 1000,
  originalSize: 100,
  width: 100,
  height: 100,
  primary: true,
  localOnly: true as const,
};
const find = {
  id: "find",
  kind: "find" as const,
  title: "Porcini",
  notes: "",
  lat: 43,
  lng: 11,
  accuracy: null,
  source: "map" as const,
  createdAt: 1000,
};
beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:test"),
    revokeObjectURL: vi.fn(),
  });
  vi.mocked(storage.readSettings).mockResolvedValue(
    defaultSettings(["it"], true),
  );
  vi.mocked(storage.readPhotoMeta).mockResolvedValue([photo]);
  vi.mocked(storage.readPhotoBlob).mockResolvedValue(
    new Blob(["jpeg"], { type: "image/jpeg" }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("revokes displayed object URLs when a photo closes", async () => {
  const view = render(
    <PreferencesProvider>
      <PhotoImage photo={photo} full />
    </PreferencesProvider>,
  );
  await screen.findByRole("img");
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
});
it("does not create leaked URLs when a pending read finishes after unmount", async () => {
  let resolve!: (blob: Blob) => void;
  vi.mocked(storage.readPhotoBlob).mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const view = render(
    <PreferencesProvider>
      <PhotoImage photo={photo} full />
    </PreferencesProvider>,
  );
  view.unmount();
  resolve(new Blob(["jpeg"]));
  await Promise.resolve();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it("keeps edits in a draft on failed save and cancelling does not persist removed photos", async () => {
  const onSave = vi.fn().mockResolvedValue(false),
    onClose = vi.fn();
  render(
    <PreferencesProvider>
      <FindForm
        draft={{ coordinate: find, source: "map", accuracy: null, find }}
        finds={[find]}
        onSave={onSave}
        onClose={onClose}
      />
    </PreferencesProvider>,
  );
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Salva punto" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Salva punto" }));
  await screen.findByRole("alert");
  expect(onClose).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Principale", exact: true }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Elimina foto 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Chiudi", exact: true }));
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onSave.mock.calls[0][0]).toMatchObject({
    lat: 43,
    lng: 11,
    createdAt: 1000,
  });
});
