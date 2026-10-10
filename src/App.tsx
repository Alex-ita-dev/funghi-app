import { MycoAreaControls } from "./components/MycoAreaControls";
import type { Viewport } from "./lib/mycoArea";
import type { EcologyProfileId as Profile } from "./lib/ecologyModel";
import {
  cellSample,
  type AreaAnalysis,
  type CellSample,
} from "./services/mycoAnalysis";
import { MycoScoreCard } from "./components/MycoScoreCard";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpFromLine,
  Bookmark,
  CarFront,
  Check,
  ChevronRight,
  CircleHelp,
  Compass,
  Crosshair,
  Flag,
  Footprints,
  Layers,
  Maximize2,
  Minimize2,
  Leaf,
  Map,
  MapPin,
  Navigation,
  Pause,
  Play,
  Plus,
  Route,
  Search,
  Settings,
  ShieldCheck,
  Square,
  Star,
  Trash2,
  Trees,
  WifiOff,
  X,
} from "lucide-react";
import { Brand } from "./components/Brand";
import { Modal } from "./components/Modal";
import MapView, { type MapViewRequest } from "./components/MapView";
import { useData } from "./hooks/useData";
import { useGps } from "./hooks/useGps";
import { useHeading } from "./hooks/useHeading";
import { CompassControl } from "./components/CompassControl";
import { MapLayerPicker } from "./components/MapLayerPicker";
import { SosPanel } from "./components/SosPanel";
import { GpsSettings } from "./components/GpsSettings";
import { usePreferences } from "./hooks/usePreferences";
import { PreferencesSettings } from "./components/PreferencesSettings";
import { Onboarding } from "./components/Onboarding";
import { needsOnboarding } from "./lib/preferences";
import { readMapViewport, resolveMapLayer, type MapLayerId } from "./lib/maps";
import {
  addFix,
  clock,
  distance,
  duration,
  openTrip,
  pauseTrip,
  resumeTrip,
  segments,
  toGpx,
  trackDistance,
  usableFix,
  type Coordinate,
  type Find,
  type Fix,
  type Trip,
} from "./lib/model";
import { download, readPhotoMeta } from "./lib/storage";
import { FindForm, type FindingDraft } from "./components/FindForm";
import { FindingDetails, FindingSummary } from "./components/FindingDetails";
import { PhotoImage } from "./components/FindingPhotos";
import type { PhotoMeta } from "./lib/photos";
import { exportBackup, parseBackup, MAX_BACKUP_BYTES } from "./lib/backup";
import { filterFindings, habitats, habitatLabels } from "./lib/findings";

type Page = "map" | "finds" | "trips" | "settings";
type Draft = FindingDraft;
type Confirm = {
  title: string;
  text: string;
  label: string;
  danger?: boolean;
  action: () => void;
};
const tabs = [
  { key: "map", title: "Esplora", Icon: Compass },
  { key: "finds", title: "I miei punti", Icon: Bookmark },
  { key: "trips", title: "Le mie uscite", Icon: Route },
  { key: "settings", title: "Impostazioni", Icon: Settings },
] as const;

export default function App() {
  const { ready, error, settings, tr } = usePreferences();
  if (!ready)
    return (
      <div className="loading">
        <Brand />
        <h1>
          {tr(
            error
              ? "Non riusciamo a leggere le preferenze."
              : "Apriamo il tuo taccuino…",
          )}
        </h1>
        {error && (
          <>
            <p>
              {tr(
                "I dati sono al sicuro: riprova senza cancellare i dati del sito.",
              )}
            </p>
            <button
              className="button primary"
              onClick={() => location.reload()}
            >
              {tr("Riprova")}
            </button>
          </>
        )}
      </div>
    );
  if (needsOnboarding(settings)) return <Onboarding onDone={() => {}} />;
  return <Journal />;
}

function Journal() {
  const {
    settings,
    tr,
    metres,
    dateLabel,
    save: savePreferences,
  } = usePreferences();
  const [editProfile, setEditProfile] = useState(false);
  const { data, update, error: storageError, saving, locked } = useData();
  const [page, setPage] = useState<Page>("map");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now());
  const [online, setOnline] = useState(navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [request, setRequest] = useState<MapViewRequest | null>(null);
  const [mycoProfile, setMycoProfile] = useState<Profile>(() =>
    settings.profile.favouriteSpecies.includes("boletus-edulis-group")
      ? "porcini"
      : "generic",
  );
  const [mycoViewport, setMycoViewport] = useState<Viewport | null>(null);
  const [mycoArea, setMycoArea] = useState<AreaAnalysis | null>(null);
  const [mycoShown, setMycoShown] = useState(false);
  const [mycoOpacity, setMycoOpacity] = useState(0.35);
  const [mycoSample, setMycoSample] = useState<CellSample | null>(null);
  function openMycoCell(index: number) {
    if (!mycoArea) return;
    const sample = cellSample(mycoArea, index);
    if (!sample) return;
    setMycoSample(sample);
    setMycoPoint(mycoArea.grid.cells[index].point);
    setMycoCard(true);
  }
  const [mycoMode, setMycoMode] = useState(false);
  const [mycoPoint, setMycoPoint] = useState<Coordinate | null>(null);
  const [mycoCard, setMycoCard] = useState(false);
  useEffect(() => {
    if (page !== "map") {
      setMycoMode(false);
      setMycoCard(false);
      setMycoPoint(null);
    }
  }, [page]);
  const [pick, setPick] = useState<"find" | "car" | null>(null);
  const [choose, setChoose] = useState<"find" | "car" | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [detail, setDetail] = useState<Find | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [help, setHelp] = useState(false);
  const [sos, setSos] = useState(false);
  const [layerPicker, setLayerPicker] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fallbackLayer, setFallbackLayer] = useState<MapLayerId | null>(null);
  const failedProviders = useRef(new Set<MapLayerId>());
  const mapCardRef = useRef<HTMLDivElement>(null);
  const layerId = settings.preferences.mapLayer;
  const baseLayer = resolveMapLayer(fallbackLayer ?? layerId);
  const mapFallback = fallbackLayer !== null || baseLayer.id !== layerId;
  function selectLayer(id: MapLayerId) {
    failedProviders.current.clear();
    setFallbackLayer(null);
    void savePreferences({ preferences: { mapLayer: id } }).catch(() => {});
  }
  const [returning, setReturning] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "find" | "spot">("all");
  const [photoMeta, setPhotoMeta] = useState<PhotoMeta[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [withPhotos, setWithPhotos] = useState(false);
  const [habitatFilter, setHabitatFilter] = useState("");
  useEffect(() => {
    let alive = true;
    void readPhotoMeta()
      .then((rows) => {
        if (alive) setPhotoMeta(rows);
      })
      .catch(() => {
        if (alive) setNotice("Impossibile leggere le foto. Riapri la scheda.");
      });
    return () => {
      alive = false;
    };
  }, [data?.finds]);
  const importRef = useRef<HTMLInputElement>(null);
  const initializedView = useRef(false);
  const handleFix = useCallback(
    (fix: Fix) =>
      update((old) => {
        const trip = openTrip(old);
        if (!trip) return old;
        const next = addFix(trip, fix);
        return next === trip
          ? old
          : {
              ...old,
              trips: old.trips.map((t) => (t.id === trip.id ? next : t)),
            };
      }),
    [update],
  );
  const gps = useGps(handleFix);
  const heading = useHeading(gps.fix, now);
  useEffect(() => {
    if (heading.message) setNotice(heading.message);
  }, [heading.message]);
  useEffect(() => {
    if (!fullscreen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    mapCardRef.current
      ?.querySelector<HTMLButtonElement>(".expand-map")
      ?.focus();
    const key = (e: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setFullscreen(false);
      }
      if (e.key !== "Tab") return;
      const controls = Array.from(
        mapCardRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], [tabindex="0"]',
        ) ?? [],
      ).filter((el) => el.getClientRects().length);
      const index = controls.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && index <= 0) {
        e.preventDefault();
        controls.at(-1)?.focus();
      } else if (!e.shiftKey && (index === controls.length - 1 || index < 0)) {
        e.preventDefault();
        controls[0]?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", key);
      previousFocus?.focus();
    };
  }, [fullscreen]);
  const locateForInfo = () => {
    void gps.locate().catch(() => {});
  };
  const active = data ? openTrip(data) : undefined;
  const viewedTrip = data?.trips.find((t) => t.id === selectedTrip) ?? active;
  const car = viewedTrip ? viewedTrip.car : (data?.car ?? null);
  const fresh = usableFix(gps.fix, now);
  const gpsLabel = gps.pending
    ? tr("Ricerca GPS…")
    : gps.permission === "denied"
      ? tr("GPS non autorizzato")
      : gps.permission === "unsupported" || gps.error
        ? tr("GPS non disponibile")
        : fresh
          ? `GPS · ±${metres(gps.fix!.accuracy)}`
          : gps.fix && now - gps.fix.timestamp <= 30000 && gps.fix.accuracy > 50
            ? tr("Precisione scarsa · ±{{accuracy}}", {
                accuracy: metres(gps.fix.accuracy),
              })
            : gps.enabled
              ? tr("In attesa del GPS")
              : tr("GPS da attivare");
  const recording = active?.status === "active";
  useEffect(() => {
    if (!data || initializedView.current) return;
    initializedView.current = true;
    const last = openTrip(data)?.points.at(-1) ?? data.car ?? data.finds[0];
    if (last && !readMapViewport())
      setRequest({ id: Date.now(), center: last });
  }, [data]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(
      () =>
        update((old) =>
          openTrip(old)?.status === "active" ? { ...old } : old,
        ),
      10000,
    );
    return () => clearInterval(id);
  }, [recording, update]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 7000);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    const change = () => setOnline(navigator.onLine);
    const hide = () => {
      if (document.hidden)
        update((old) => {
          const trip = openTrip(old);
          if (!trip || trip.status !== "active") return old;
          setNotice(
            "Uscita messa in pausa: MycoTrail era in background. Tocca Riprendi per continuare.",
          );
          return {
            ...old,
            trips: old.trips.map((t) => (t.id === trip.id ? pauseTrip(t) : t)),
          };
        });
    };
    window.addEventListener("online", change);
    window.addEventListener("offline", change);
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", hide);
    return () => {
      window.removeEventListener("online", change);
      window.removeEventListener("offline", change);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", hide);
    };
  }, [update]);
  useEffect(() => {
    if (!recording || !navigator.wakeLock) return;
    let lock: WakeLockSentinel | undefined;
    let cancelled = false;
    void navigator.wakeLock
      .request("screen")
      .then((value) => {
        if (cancelled) void value.release();
        else lock = value;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      void lock?.release();
    };
  }, [recording]);

  const center = (p: Coordinate) => {
    setPage("map");
    setRequest({ id: Date.now(), center: p });
  };
  const fit = (trip?: Trip, targetCar = trip?.car ?? car) => {
    const bounds: Coordinate[] = [
      ...(trip?.points ?? []),
      ...(targetCar ? [targetCar] : []),
      ...(gps.fix ? [gps.fix] : []),
    ];
    setPage("map");
    if (bounds.length) setRequest({ id: Date.now(), bounds });
  };
  async function withFix(action: (fix: Fix, altitudeM?: number) => void) {
    setBusy(true);
    try {
      const fix = await gps.locate();
      if (!usableFix(fix)) {
        setNotice(
          tr(
            "GPS ancora impreciso (±{{accuracy}}). Attendi un segnale entro {{limit}} oppure scegli il punto sulla mappa.",
            { accuracy: metres(fix.accuracy), limit: metres(50) },
          ),
        );
        return;
      }
      action(
        {
          lat: fix.lat,
          lng: fix.lng,
          accuracy: fix.accuracy,
          timestamp: fix.timestamp,
        },
        fix.altitude !== null &&
          fix.altitude >= -12000 &&
          fix.altitude <= 100000
          ? fix.altitude
          : undefined,
      );
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function start() {
    if (data && data.trips.length >= 500) {
      setNotice(
        tr(
          "Limite di 500 uscite raggiunto. Esporta un backup e rimuovi alcune uscite.",
        ),
      );
      return;
    }
    void withFix((fix) => {
      const stamp = Date.now();
      update((old) => {
        if (openTrip(old) || old.trips.length >= 500) return old;
        const trip: Trip = {
          id: crypto.randomUUID(),
          name: tr("Uscita del {{date}}", { date: dateLabel(stamp) }),
          startedAt: stamp,
          endedAt: null,
          status: "active",
          points: [],
          segment: 0,
          elapsedMs: 0,
          resumedAt: stamp,
          car: old.car,
        };
        return { ...old, trips: [addFix(trip, fix), ...old.trips] };
      });
      setSelectedTrip(null);
      setReturning(false);
      center(fix);
      setNotice(
        tr("Registrazione avviata. Tieni MycoTrail visibile durante l’uscita."),
      );
    });
  }
  function resume() {
    void withFix((fix) => {
      update((old) => ({
        ...old,
        trips: old.trips.map((t) =>
          t.status === "paused" ? addFix(resumeTrip(t), fix) : t,
        ),
      }));
      setSelectedTrip(null);
      center(fix);
      setNotice(tr("Registrazione ripresa in un nuovo tratto."));
    });
  }
  function stop() {
    setConfirm({
      title: tr("Concludi questa uscita?"),
      text: tr(
        "Il percorso rimarrà nelle tue uscite. Potrai rivederlo ed esportarlo quando vuoi.",
      ),
      label: tr("Concludi e salva"),
      action: () => {
        const id = active?.id;
        update((old) => ({
          ...old,
          trips: old.trips.map((t) =>
            t.id === id
              ? { ...pauseTrip(t), status: "completed", endedAt: Date.now() }
              : t,
          ),
        }));
        setSelectedTrip(id ?? null);
        setNotice(tr("Uscita conclusa. Trovi il percorso in Le mie uscite."));
      },
    });
  }
  function saveCar(coordinate: Coordinate, accuracy: number | null) {
    const value = { ...coordinate, accuracy, savedAt: Date.now() };
    update((old) => ({
      ...old,
      car: value,
      trips: old.trips.map((t) =>
        t.status !== "completed" ? { ...t, car: value } : t,
      ),
    }));
    setSelectedTrip(null);
    setReturning(false);
    center(value);
    setNotice(tr("Posizione auto salvata."));
  }
  function chooseLocation(kind: "find" | "car", source: "gps" | "map") {
    setChoose(null);
    if (source === "map") {
      setPage("map");
      setPick(kind);
      return;
    }
    void withFix((fix, altitudeM) => {
      if (kind === "car") saveCar(fix, fix.accuracy);
      else
        setDraft({
          coordinate: fix,
          source: "gps",
          accuracy: fix.accuracy,
          altitudeM,
        });
    });
  }
  function onPick(coordinate: Coordinate) {
    if (!pick) return;
    if (pick === "car") saveCar(coordinate, null);
    else setDraft({ coordinate, source: "map", accuracy: null });
    setPick(null);
  }
  function goBack() {
    const trip =
      active ??
      (selectedTrip
        ? data?.trips.find((t) => t.id === selectedTrip)
        : data?.trips.find(
            (t) => t.car && t.car.savedAt === data.car?.savedAt,
          ));
    const target = trip?.car ?? data?.car;
    if (!target) {
      setChoose("car");
      return;
    }
    setSelectedTrip(trip?.id ?? null);
    setReturning(true);
    fit(trip, target);
  }
  async function backup() {
    if (!data || saving || busy) return;
    setBusy(true);
    try {
      download(
        await exportBackup(data),
        `mycotrail-backup-${new Date().toISOString().slice(0, 10)}.json`,
        "application/json",
      );
    } catch (e) {
      setNotice(tr((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  async function importBackup(file?: File) {
    if (!file || saving || busy || active) return;
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error("Backup too large");
      const imported = parseBackup(await file.text());
      setConfirm({
        title: tr("Ripristina il backup?"),
        text: tr(
          "Il backup sostituirà punti, foto e uscite. Esporta prima i dati attuali.",
        ),
        label: tr("Ripristina dati"),
        action: () => {
          if (recording || saving) return;
          setBusy(true);
          void update(() => imported.data, { replaceAll: imported.photos })
            .then((ok) => {
              if (ok) {
                setSelectedTrip(null);
                setReturning(false);
                setNotice(
                  tr("Backup ripristinato. Le uscite aperte sono in pausa."),
                );
              } else setNotice(tr("Ripristino non riuscito. Riprova."));
            })
            .finally(() => setBusy(false));
        },
      });
    } catch {
      setNotice(tr("Backup non valido o troppo grande. Limite: 100 MB."));
    }
  }

  if (!data)
    return (
      <div className="loading">
        <Brand />
        <h1>
          {locked
            ? tr("MycoTrail è già aperta")
            : storageError
              ? tr("Non riusciamo ad aprire il taccuino")
              : tr("Apriamo il tuo taccuino…")}
        </h1>
        <p>
          {locked
            ? tr(
                "Chiudi l’altra scheda di MycoTrail, poi ricarica questa pagina.",
              )
            : tr(storageError) || tr("Un momento, prepariamo la mappa.")}
        </p>
        {(locked || storageError) && (
          <button className="button primary" onClick={() => location.reload()}>
            {" "}
            {tr("Riprova")}{" "}
          </button>
        )}
      </div>
    );
  const shownFinds = filterFindings(
    data.finds,
    {
      query,
      kind: filter,
      from: dateFrom,
      to: dateTo,
      withPhotos,
      habitat: habitatFilter,
    },
    new Set(photoMeta.map((p) => p.findingId)),
  );
  const totalDistance = data.trips.reduce(
    (total, t) => total + trackDistance(t),
    0,
  );
  return (
    <div className={`app-shell ${fullscreen ? "map-is-fullscreen" : ""}`}>
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-section-label">{tr("IL TUO TACCUINO")}</div>
        <nav aria-label={tr("Navigazione principale")}>
          {tabs.map(({ key, title, Icon }) => (
            <button
              key={key}
              className={`nav-item ${page === key ? "active" : ""}`}
              onClick={() => {
                setPage(key);
                setPick(null);
              }}
            >
              <Icon size={21} />
              <span>{tr(title)}</span>
              {key === "finds" && data.finds.length > 0 && (
                <span className="nav-count">{data.finds.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Trees size={30} />
            <strong>{tr("Ogni uscita, una scoperta.")}</strong>
            <p>
              {" "}
              {tr("Custodisci i tuoi luoghi.")} <br />{" "}
              {tr("Lascia al bosco la sua bellezza.")}{" "}
            </p>
          </div>
          <button className="local-profile" onClick={() => setPage("settings")}>
            <span className="avatar">
              <Leaf size={19} />
            </span>
            <span>
              <strong>
                {settings.profile.nickname || tr("Il mio taccuino")}
              </strong>
              <small>{tr("Salvato su questo dispositivo")}</small>
            </span>
            <ChevronRight size={17} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="mobile-brand">
            <Brand />
          </div>
          <div className="breadcrumb">
            {" "}
            {tr("Il tuo spazio")} <ChevronRight size={14} />
            <strong>{tr(tabs.find((t) => t.key === page)!.title)}</strong>
          </div>
          <div className="topbar-right">
            <span className="version-pill">V2 · OUTDOOR</span>
            <button
              className="icon-button help-button"
              aria-label={tr("Come funziona MycoTrail")}
              onClick={() => setHelp(true)}
            >
              <CircleHelp size={21} />
            </button>
            <span className="avatar desktop-avatar">MT</span>
          </div>
        </header>
        <main className={`content page-${page}`}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === "map"
                  ? tr("IL PROSSIMO SENTIERO TI ASPETTA")
                  : page === "finds"
                    ? tr("I LUOGHI CHE VALE LA PENA RICORDARE")
                    : page === "trips"
                      ? tr("UN PASSO DOPO L’ALTRO")
                      : tr("IL TUO SPAZIO, LE TUE SCELTE")}
              </div>
              <h1>
                {page === "map"
                  ? tr("Ci vediamo nel bosco.")
                  : page === "finds"
                    ? tr("Il tuo piccolo tesoro.")
                    : page === "trips"
                      ? tr("Storie di sentieri.")
                      : tr("Pronti a partire.")}
              </h1>
              <p>
                {page === "map"
                  ? tr("Segui il tuo percorso. Ritrova i tuoi posti.")
                  : page === "finds"
                    ? tr("Ritrovamenti e fungaie, custoditi nel tuo taccuino.")
                    : page === "trips"
                      ? tr("Ogni percorso rimane qui, pronto da ripercorrere.")
                      : tr("Gestisci i dati e porta MycoTrail sempre con te.")}
              </p>
            </div>
            {page === "map" ? (
              <div
                className={`gps-badge ${fresh && !gps.error && !gps.pending ? "good" : ""}`}
                role="status"
              >
                <span />
                {gpsLabel}
              </div>
            ) : page === "finds" ? (
              <button
                className="button primary"
                onClick={() => setChoose("find")}
              >
                <Plus size={18} /> {tr("Nuovo punto")}{" "}
              </button>
            ) : page === "trips" ? (
              <div className="total-distance">
                <Footprints size={20} />
                {metres(totalDistance)} {tr("esplorati")}{" "}
              </div>
            ) : null}
          </div>
          {storageError && (
            <div className="banner error" role="alert">
              {tr(storageError)}
              <button disabled={saving || busy} onClick={backup}>
                {tr("Esporta backup")}
              </button>
            </div>
          )}
          {!settings.onboardingCompleted && (
            <div className="banner profile-banner">
              <span>{tr("Completa il tuo profilo MycoTrail")}</span>
              <button onClick={() => setEditProfile(true)}>
                {tr("Configura profilo")}
              </button>
            </div>
          )}
          {!online && (
            <div className="banner">
              <WifiOff size={18} />{" "}
              {tr(
                "Sei offline. I dati restano sul dispositivo; nuove aree della mappa richiedono internet.",
              )}{" "}
            </div>
          )}
          <section
            className={`explore-layout ${page !== "map" ? "hidden" : ""}`}
            aria-label={tr("Esplora la mappa")}
          >
            <div
              ref={mapCardRef}
              className={`map-card ${fullscreen ? "map-fullscreen" : ""}`}
              role={fullscreen ? "region" : undefined}
              aria-label={fullscreen ? tr("Mappa a schermo intero") : undefined}
            >
              <div className="map-top-label">
                <button
                  className="map-layer layer-button"
                  onClick={() => setLayerPicker((open) => !open)}
                  aria-expanded={layerPicker}
                  aria-controls="map-layer-panel"
                  aria-label={tr("Scegli mappa: {{name}}", {
                    name: tr(baseLayer.name),
                  })}
                >
                  <Layers size={16} />
                  {tr(baseLayer.name)}
                </button>
                <span className="map-area">
                  {gps.fix
                    ? `${gps.fix.lat.toFixed(3)}°, ${gps.fix.lng.toFixed(3)}°`
                    : tr("Vista iniziale · Valdarno")}
                </span>
                <div className="map-header-actions">
                  <button className="sos-button" onClick={() => setSos(true)}>
                    SOS
                  </button>
                  <button
                    className="icon-button expand-map"
                    title={
                      fullscreen ? tr("Riduci mappa") : tr("Espandi mappa")
                    }
                    aria-label={
                      fullscreen ? tr("Riduci mappa") : tr("Espandi mappa")
                    }
                    onClick={() => setFullscreen((value) => !value)}
                  >
                    {fullscreen ? (
                      <Minimize2 size={21} />
                    ) : (
                      <Maximize2 size={21} />
                    )}
                  </button>
                </div>
              </div>
              {layerPicker && (
                <MapLayerPicker
                  selected={baseLayer.id}
                  onSelect={selectLayer}
                  onClose={() => setLayerPicker(false)}
                />
              )}
              {mapFallback && (
                <p className="map-provider-notice" role="status">
                  {tr("Mappa non disponibile. Mostriamo {{name}}.", {
                    name: tr(baseLayer.name),
                  })}
                </p>
              )}
              <div className="myco-toolbar">
                <button
                  className="button secondary"
                  aria-pressed={mycoMode && !pick}
                  onClick={() => {
                    setMycoMode(!(mycoMode && !pick));
                    setMycoPoint(null);
                    setMycoCard(false);
                    setPick(null);
                    setLayerPicker(false);
                  }}
                >
                  {tr(mycoMode && !pick ? "myco.exit" : "myco.title")}
                </button>
                {mycoMode && !pick && (
                  <small role="status">{tr("myco.pick")}</small>
                )}
              </div>
              {mycoMode && !pick && (
                <MycoAreaControls
                  viewport={mycoViewport}
                  profile={mycoProfile}
                  onProfile={setMycoProfile}
                  area={mycoArea}
                  onArea={setMycoArea}
                  shown={mycoShown}
                  onShown={setMycoShown}
                  opacity={mycoOpacity}
                  onOpacity={setMycoOpacity}
                  onCell={openMycoCell}
                />
              )}
              <div className="map-stage">
                <MapView
                  baseLayer={baseLayer}
                  onFallback={() => {
                    failedProviders.current.add(baseLayer.id);
                    const next = (["street", "topo"] as const).find(
                      (id) => !failedProviders.current.has(id),
                    );
                    if (next) setFallbackLayer(next);
                  }}
                  fix={gps.fix}
                  car={car}
                  finds={data.finds}
                  trip={viewedTrip}
                  request={request}
                  picking={!!pick || mycoMode}
                  scorePoint={mycoMode && !pick ? mycoPoint : null}
                  onViewport={setMycoViewport}
                  area={mycoMode && !pick && mycoShown ? mycoArea : null}
                  areaOpacity={mycoOpacity}
                  onCell={openMycoCell}
                  onPick={(coordinate) => {
                    if (pick) {
                      setMycoMode(false);
                      setMycoCard(false);
                      setMycoPoint(null);
                      onPick(coordinate);
                    } else if (mycoMode) {
                      setMycoSample(null);
                      setMycoPoint(coordinate);
                      setMycoCard(true);
                    }
                  }}
                  onFind={setDetail}
                  visible={page === "map"}
                />
                <CompassControl
                  degrees={heading.degrees}
                  source={heading.source}
                  onEnable={() => void heading.enable()}
                />
                <button
                  className="locate-button"
                  aria-label={tr("Centra sulla mia posizione")}
                  disabled={busy}
                  onClick={() => {
                    void withFix(center);
                  }}
                >
                  <Crosshair size={22} />
                </button>
                {pick && (
                  <div className="pick-banner">
                    <MapPin size={18} />
                    <span>
                      {" "}
                      {tr("Tocca la mappa per")}{" "}
                      {pick === "car"
                        ? tr("segnare l’auto")
                        : tr("aggiungere un punto")}
                    </span>
                    <button
                      className="icon-button"
                      aria-label={tr("Annulla selezione")}
                      onClick={() => setPick(null)}
                    >
                      <X size={18} />
                    </button>
                  </div>
                )}
                {!gps.enabled && !pick && !mycoMode && (
                  <div className="map-intro">
                    <span className="intro-icon">
                      <Navigation size={22} />
                    </span>
                    <div>
                      <strong>{tr("Il bosco comincia da qui.")}</strong>
                      <p>
                        {tr("Attiva la posizione per orientarti sulla mappa.")}
                      </p>
                    </div>
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() => {
                        void withFix(center);
                      }}
                    >
                      {busy ? tr("Ricerca…") : tr("Attiva GPS")}
                      <ArrowRight size={16} />
                    </button>
                  </div>
                )}
              </div>
              {fullscreen && (
                <div className="fullscreen-actions">
                  <div className="fullscreen-status" role="status">
                    {gpsLabel} ·{" "}
                    {recording
                      ? tr("Registrazione in corso · schermo acceso")
                      : active
                        ? tr("Uscita in pausa")
                        : tr("Nessuna registrazione")}
                  </div>
                  {returning && (
                    <p className="fullscreen-return">
                      {" "}
                      {tr(
                        "Auto e traccia inquadrate. La traccia può avere interruzioni; non è un itinerario calcolato.",
                      )}{" "}
                    </p>
                  )}
                  <div className="fullscreen-action-grid">
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => setChoose("find")}
                    >
                      <MapPin size={18} /> {tr("Salva punto")}{" "}
                    </button>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        data.car
                          ? setConfirm({
                              title: tr("Aggiorna la posizione auto?"),
                              text: tr(
                                "Sostituirai il punto auto corrente. Le uscite concluse lo conserveranno.",
                              ),
                              label: tr("Scegli nuova posizione"),
                              action: () => setChoose("car"),
                            })
                          : setChoose("car")
                      }
                    >
                      <CarFront size={18} /> {tr("Salva auto")}{" "}
                    </button>
                    <button className="button secondary" onClick={goBack}>
                      <Navigation size={18} /> {tr("Torna auto")}{" "}
                    </button>
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={
                        recording
                          ? () =>
                              update((old) => ({
                                ...old,
                                trips: old.trips.map((t) =>
                                  t.status === "active" ? pauseTrip(t) : t,
                                ),
                              }))
                          : active
                            ? resume
                            : start
                      }
                    >
                      {recording ? <Pause size={18} /> : <Play size={18} />}
                      {recording
                        ? tr("Pausa")
                        : active
                          ? tr("Riprendi")
                          : tr("Avvia uscita")}
                    </button>
                  </div>
                  {storageError && (
                    <p role="alert" className="inline-error">
                      {tr(storageError)}
                      <button
                        className="text-button"
                        disabled={saving || busy}
                        onClick={backup}
                      >
                        {" "}
                        {tr("Esporta backup")}{" "}
                      </button>
                    </p>
                  )}
                </div>
              )}
              <div className="map-legend">
                <span>
                  <i className="legend-dot blue" /> {tr("Tu")}{" "}
                </span>
                <span>
                  <i className="legend-dot green" /> {tr("Auto")}{" "}
                </span>
                <span>
                  <i className="legend-dot orange" /> {tr("Ritrovamento")}{" "}
                </span>
                <span>
                  <Star size={12} /> {tr("Fungaia")}{" "}
                </span>
                <span className="local-save">
                  <ShieldCheck size={14} />
                  {saving
                    ? tr("Salvataggio…")
                    : storageError
                      ? tr("Dati non salvati")
                      : tr("Dati sul dispositivo")}
                </span>
              </div>
            </div>
            <aside className="outing-panel">
              {returning ? (
                <div className="outing-card return-card">
                  <div className="card-eyebrow">
                    <Navigation size={16} /> {tr("VERSO L’AUTO")}{" "}
                  </div>
                  <h2>{tr("Ripercorri i tuoi passi.")}</h2>
                  <p>
                    {" "}
                    {tr(
                      "Segui sulla mappa i tratti arancioni che hai registrato.",
                    )}{" "}
                  </p>
                  {car && gps.fix && (
                    <div className="return-distance">
                      {metres(distance(gps.fix, car))}
                      <small>
                        {tr("in linea d’aria dall’ultima posizione")}
                      </small>
                    </div>
                  )}
                  <div className="info-note">
                    {viewedTrip?.points.length
                      ? tr(
                          "La traccia può avere interruzioni. Non viene calcolato un percorso pedonale.",
                        )
                      : tr(
                          "Non c’è una traccia registrata per questa auto. Il segnaposto indica solo la sua posizione.",
                        )}
                  </div>
                  <button
                    className="button secondary full"
                    onClick={() => fit(viewedTrip)}
                  >
                    {" "}
                    {tr("Inquadra auto e traccia")}{" "}
                  </button>
                  <button
                    className="text-button full"
                    onClick={() => setReturning(false)}
                  >
                    <ArrowLeft size={16} /> {tr("Torna all’esplorazione")}{" "}
                  </button>
                </div>
              ) : (
                <div className="outing-card">
                  <div className="card-eyebrow">
                    <span
                      className={`status-dot ${recording ? "recording" : ""}`}
                    />
                    {active
                      ? recording
                        ? tr("USCITA IN CORSO")
                        : tr("USCITA IN PAUSA")
                      : tr("LA TUA PROSSIMA USCITA")}
                  </div>
                  <h2>
                    {active
                      ? tr("Un passo alla volta.")
                      : tr("Prenditi un po’ di bosco.")}
                  </h2>
                  <p>
                    {active
                      ? recording
                        ? tr("Stiamo custodendo il tuo percorso.")
                        : tr("La traccia è salvata. Riparti quando vuoi.")
                      : tr("Avvia il percorso e lascia spazio alla scoperta.")}
                  </p>
                  <div className="trip-stats">
                    <div>
                      <strong>
                        {metres(active ? trackDistance(active) : 0)}
                      </strong>
                      <span>
                        <Footprints size={13} /> {tr("Percorso")}{" "}
                      </span>
                    </div>
                    <div>
                      <strong>
                        {active ? clock(duration(active, now)) : "00:00"}
                      </strong>
                      <span>
                        <Route size={13} /> {tr("Tempo attivo")}{" "}
                      </span>
                    </div>
                  </div>
                  {active ? (
                    <div className="record-controls">
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={
                          recording
                            ? () =>
                                update((old) => ({
                                  ...old,
                                  trips: old.trips.map((t) =>
                                    t.id === active.id ? pauseTrip(t) : t,
                                  ),
                                }))
                            : resume
                        }
                      >
                        {recording ? <Pause size={17} /> : <Play size={17} />}{" "}
                        {recording ? tr("Pausa") : tr("Riprendi")}
                      </button>
                      <button className="button secondary" onClick={stop}>
                        <Square size={15} /> {tr("Concludi")}{" "}
                      </button>
                    </div>
                  ) : (
                    <button
                      className="button primary full"
                      disabled={busy}
                      onClick={start}
                    >
                      <Play size={18} />
                      {busy ? tr("Cerchiamo il GPS…") : tr("Avvia uscita")}
                      <ArrowRight size={17} />
                    </button>
                  )}
                  <div className="record-hint">
                    {recording && !fresh
                      ? tr(
                          "Segnale GPS assente o impreciso: in attesa di una posizione valida.",
                        )
                      : active?.points.length === 100000
                        ? tr(
                            "Limite traccia raggiunto. Concludi l’uscita e avviane una nuova.",
                          )
                        : tr(
                            "Tieni l’app visibile. In background l’uscita va in pausa.",
                          )}
                  </div>
                </div>
              )}
              <div className="quick-actions">
                <button disabled={busy} onClick={() => setChoose("find")}>
                  <span className="action-icon orange">
                    <Plus size={23} />
                  </span>
                  <span>
                    <strong>{tr("Segna un punto")}</strong>
                    <small>{tr("Un ritrovamento, un posto speciale")}</small>
                  </span>
                  <ChevronRight size={18} />
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    data.car
                      ? setConfirm({
                          title: tr("Aggiorna la posizione auto?"),
                          text: tr(
                            "Il punto auto attuale sarà sostituito. Le uscite concluse conserveranno il loro punto originale.",
                          ),
                          label: tr("Scegli nuova posizione"),
                          action: () => setChoose("car"),
                        })
                      : setChoose("car")
                  }
                >
                  <span className="action-icon green">
                    <CarFront size={22} />
                  </span>
                  <span>
                    <strong>
                      {data.car ? tr("Auto salvata") : tr("Salva l’auto")}
                    </strong>
                    <small>
                      {data.car
                        ? tr("Posizione del {{date}}", {
                            date: dateLabel(data.car.savedAt),
                          })
                        : tr("Il tuo punto di partenza")}
                    </small>
                  </span>
                  <ChevronRight size={18} />
                </button>
                <button onClick={goBack}>
                  <span className="action-icon sand">
                    <Navigation size={21} />
                  </span>
                  <span>
                    <strong>{tr("Torna all’auto")}</strong>
                    <small>{tr("Ritrova il percorso registrato")}</small>
                  </span>
                  <ChevronRight size={18} />
                </button>
              </div>
              {viewedTrip && viewedTrip.id !== active?.id && (
                <div className="selected-trip">
                  <Route size={17} />
                  <span>
                    {tr("Stai vedendo:")} {viewedTrip.name}
                  </span>
                  <button
                    className="icon-button"
                    aria-label={tr("Nascondi percorso")}
                    onClick={() => {
                      setSelectedTrip(null);
                      setReturning(false);
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              {gps.error && (
                <div className="inline-error" role="alert">
                  {tr(gps.error)}
                </div>
              )}
              <div className="forest-note">
                <Leaf size={18} />
                <span>
                  {" "}
                  {tr("I posti migliori sono quelli")} <br />{" "}
                  {tr("che impari a riconoscere.")}{" "}
                </span>
              </div>
            </aside>
            <section className="recent-section">
              <div className="section-heading">
                <h2>
                  {" "}
                  {tr("I tuoi ultimi punti")} <span>{data.finds.length}</span>
                </h2>
                <button
                  className="text-button"
                  onClick={() => setPage("finds")}
                >
                  {" "}
                  {tr("Il taccuino")} <ArrowRight size={15} />
                </button>
              </div>
              {data.finds.length ? (
                <div className="recent-grid">
                  {data.finds.slice(0, 3).map((f) => (
                    <button
                      className="recent-item"
                      key={f.id}
                      onClick={() => {
                        center(f);
                        setDetail(f);
                      }}
                    >
                      <span
                        className={`action-icon ${f.kind === "spot" ? "green" : "orange"}`}
                      >
                        {f.kind === "spot" ? (
                          <Star size={21} />
                        ) : (
                          <MapPin size={21} />
                        )}
                      </span>
                      <span>
                        <strong>{f.title}</strong>
                        <small>
                          {dateLabel(f.createdAt)} ·{" "}
                          {f.kind === "spot"
                            ? tr("Fungaia")
                            : tr("Ritrovamento")}
                        </small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="empty-strip">
                  <span className="empty-icon">
                    <MapPin size={25} />
                  </span>
                  <div>
                    <strong>{tr("Il tuo primo punto ti aspetta.")}</strong>
                    <p>
                      {" "}
                      {tr(
                        "Salva un ritrovamento o una fungaia: li ritroverai qui.",
                      )}{" "}
                    </p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setChoose("find")}
                  >
                    {" "}
                    {tr("Aggiungi un punto")} <Plus size={16} />
                  </button>
                </div>
              )}
            </section>
          </section>
          {page === "finds" && (
            <section>
              <div className="list-toolbar">
                <div className="filters" aria-label={tr("Filtra punti")}>
                  {(["all", "find", "spot"] as const).map((f) => (
                    <button
                      key={f}
                      className={filter === f ? "selected" : ""}
                      onClick={() => setFilter(f)}
                    >
                      {f === "all"
                        ? tr("Tutti")
                        : f === "find"
                          ? tr("Ritrovamenti")
                          : tr("Fungaie")}
                    </button>
                  ))}
                </div>
                <label className="search-input">
                  <Search size={18} />
                  <input
                    aria-label={tr("Cerca nei punti")}
                    placeholder={tr("Cerca nel taccuino…")}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              <details className="finding-extra notebook-filters">
                <summary>{tr("Altri filtri")}</summary>
                <div className="field-pair">
                  <label className="field">
                    {tr("Dal")}
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    {tr("Al")}
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                  </label>
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={withPhotos}
                    onChange={(e) => setWithPhotos(e.target.checked)}
                  />
                  {tr("Con foto")}
                </label>
                <label className="field">
                  {tr("Habitat")}
                  <select
                    value={habitatFilter}
                    onChange={(e) => setHabitatFilter(e.target.value)}
                  >
                    <option value="">{tr("Tutti")}</option>
                    {habitats.map((h) => (
                      <option key={h} value={h}>
                        {tr(habitatLabels[h])}
                      </option>
                    ))}
                  </select>
                </label>
              </details>
              {shownFinds.length ? (
                <div className="find-grid">
                  {shownFinds.map((f) => (
                    <article className="find-card" key={f.id}>
                      <div className={`find-card-top ${f.kind}`}>
                        {photoMeta.find(
                          (p) => p.findingId === f.id && p.primary,
                        ) && (
                          <PhotoImage
                            photo={photoMeta.find(
                              (p) => p.findingId === f.id && p.primary,
                            )!}
                          />
                        )}
                        <span>
                          {f.kind === "spot" ? (
                            <Trees size={43} />
                          ) : (
                            <Leaf size={43} />
                          )}
                        </span>
                        <span className="find-kind">
                          {f.kind === "spot"
                            ? tr("Fungaia")
                            : tr("Ritrovamento")}
                        </span>
                      </div>
                      <div className="find-card-content">
                        <small>{dateLabel(f.createdAt)}</small>
                        <h2>{f.title}</h2>
                        <FindingSummary find={f} />
                        <p>{f.notes || tr("Un luogo da ricordare.")}</p>
                        <button
                          className="text-button"
                          onClick={() => {
                            center(f);
                            setDetail(f);
                          }}
                        >
                          {" "}
                          {tr("Apri sulla mappa")} <ArrowRight size={16} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty
                  icon={<Bookmark size={34} />}
                  title={
                    data.finds.length
                      ? tr("Nessun punto trovato.")
                      : tr("Il taccuino è tutto da scrivere.")
                  }
                  text={
                    data.finds.length
                      ? tr("Prova un altro nome o cambia filtro.")
                      : tr(
                          "Aggiungi un punto usando il GPS o scegliendolo sulla mappa.",
                        )
                  }
                />
              )}
            </section>
          )}
          {page === "trips" && (
            <section className="trips-list">
              {data.trips.length ? (
                data.trips.map((t) => (
                  <article className="trip-row" key={t.id}>
                    <span className="trip-row-icon">
                      <Route size={27} />
                    </span>
                    <div className="trip-row-name">
                      <span className="mini-label">
                        {t.status === "completed"
                          ? tr("CONCLUSA")
                          : t.status === "active"
                            ? tr("IN CORSO")
                            : tr("IN PAUSA")}
                      </span>
                      <h2>{t.name}</h2>
                      <p>
                        {dateLabel(t.startedAt)} · {t.points.length}{" "}
                        {tr("posizioni ·")} {segments(t.points).length}{" "}
                        {tr("tratti")}{" "}
                      </p>
                    </div>
                    <div className="trip-row-stat">
                      <strong>{metres(trackDistance(t))}</strong>
                      <small>
                        {clock(duration(t, now))} {tr("ore")}
                      </small>
                    </div>
                    <div className="trip-row-actions">
                      <button
                        className="button secondary"
                        onClick={() => {
                          setSelectedTrip(t.id);
                          setReturning(false);
                          fit(t);
                        }}
                      >
                        <Map size={17} /> {tr("Vedi")}{" "}
                      </button>
                      <button
                        className="icon-button"
                        aria-label={tr("Esporta GPX {{name}}", {
                          name: t.name,
                        })}
                        onClick={() =>
                          download(
                            toGpx(t),
                            `mycotrail-${t.id}.gpx`,
                            "application/gpx+xml",
                          )
                        }
                      >
                        <ArrowDownToLine size={19} />
                      </button>
                      {t.status === "completed" && (
                        <button
                          className="icon-button"
                          aria-label={tr("Elimina {{name}}", { name: t.name })}
                          onClick={() =>
                            setConfirm({
                              title: tr("Elimina questa uscita?"),
                              text: tr(
                                "Il percorso sarà rimosso da questo dispositivo. I ritrovamenti rimarranno nel taccuino.",
                              ),
                              label: tr("Elimina uscita"),
                              danger: true,
                              action: () => {
                                update((old) => ({
                                  ...old,
                                  trips: old.trips.filter((x) => x.id !== t.id),
                                }));
                                if (selectedTrip === t.id)
                                  setSelectedTrip(null);
                              },
                            })
                          }
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </article>
                ))
              ) : (
                <Empty
                  icon={<Route size={36} />}
                  title={tr("Il primo sentiero è ancora da percorrere.")}
                  text={tr(
                    "Tocca Avvia uscita nella mappa per registrare il tuo percorso.",
                  )}
                />
              )}
            </section>
          )}
          {page === "settings" && (
            <section className="settings-grid">
              <PreferencesSettings onProfile={() => setEditProfile(true)}>
                <GpsSettings
                  permission={gps.permission}
                  pending={gps.pending}
                  error={gps.error}
                  onLocate={locateForInfo}
                />
                <article className="settings-card">
                  <span className="action-icon green">
                    <ShieldCheck size={23} />
                  </span>
                  <h2>{tr("Dati e backup")}</h2>
                  <p>
                    {" "}
                    {tr(
                      "Punti e percorsi sono salvati solo in questo browser, su questo dispositivo. Non hai ancora un account e non vengono sincronizzati.",
                    )}{" "}
                  </p>
                  <p>
                    {" "}
                    {tr(
                      "Se cancelli i dati del sito o cambi dispositivo, puoi perderli. Esporta periodicamente un backup.",
                    )}{" "}
                  </p>
                  <button
                    className="button primary"
                    disabled={saving || busy}
                    onClick={backup}
                  >
                    <ArrowDownToLine size={17} /> {tr("Esporta backup")}{" "}
                  </button>
                  <button
                    className="button secondary"
                    disabled={!!active || saving || busy}
                    onClick={() => importRef.current?.click()}
                  >
                    <ArrowUpFromLine size={17} /> {tr("Importa backup")}{" "}
                  </button>
                  {active && (
                    <small>
                      {tr("Concludi l’uscita prima di importare un backup.")}
                    </small>
                  )}
                  <input
                    ref={importRef}
                    type="file"
                    accept=".json,application/json"
                    hidden
                    onChange={(e) => {
                      void importBackup(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </article>
                <article className="settings-card">
                  <span className="action-icon orange">
                    <Navigation size={23} />
                  </span>
                  <h2>{tr("MycoTrail sul tuo telefono.")}</h2>
                  <ol>
                    <li>
                      {tr(
                        "Apri MycoTrail nel tuo browser su iPhone o Android.",
                      )}
                    </li>
                    <li>
                      {" "}
                      {tr("Su iPhone cerca")}{" "}
                      <strong>
                        {tr("Condividi → Aggiungi alla schermata Home")}
                      </strong>
                      .
                    </li>
                    <li>
                      {" "}
                      {tr("Su Android apri il menu del browser e cerca")}{" "}
                      <strong>{tr("Installa app")}</strong> {tr("o")}{" "}
                      <strong>{tr("Aggiungi a schermata Home")}</strong>.
                    </li>
                    <li>{tr("Apri MycoTrail e consenti la posizione.")}</li>
                  </ol>
                  <p>
                    {" "}
                    {tr(
                      "Durante la registrazione tieni l’app in primo piano. Proviamo a mantenere lo schermo acceso quando il browser lo consente. Il tracking affidabile a schermo spento richiederà la futura versione nativa, anche se installi questa web app sulla Home.",
                    )}{" "}
                  </p>
                  <button className="text-button" onClick={() => setHelp(true)}>
                    {" "}
                    {tr("Leggi la guida")} <ArrowRight size={16} />
                  </button>
                </article>
                <article className="settings-card wide">
                  <span className="mini-label">MycoTrail · 0.3.0 · Web</span>
                  <h2>{tr("Info e privacy")}</h2>
                  <p>
                    {" "}
                    {tr(
                      "Mappe selezionabili, bussola, schermo intero e SOS affiancano il taccuino e le uscite. Mappe scaricabili, pendenze numeriche e filtro versanti non sono ancora disponibili.",
                    )}{" "}
                  </p>
                  <p>
                    {" "}
                    {tr(
                      "La cartografia viene caricata da OpenTopoMap, OpenStreetMap o, se configurato, MapTiler: il fornitore riceve le normali richieste web per l’area visualizzata. L’app non invia a un nostro server le tue fungaie o le tue tracce.",
                    )}{" "}
                  </p>
                </article>
              </PreferencesSettings>
            </section>
          )}
          <footer className="page-footer">
            <Brand compact />
            <span>{tr("Prenditi cura dei tuoi luoghi.")}</span>
            <span>{tr("MycoTrail · Fatto per esplorare")}</span>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label={tr("Navigazione mobile")}>
        {tabs.map(({ key, title, Icon }) => (
          <button
            key={key}
            className={page === key ? "active" : ""}
            onClick={() => {
              setPage(key);
              setPick(null);
            }}
          >
            <Icon size={21} />
            <span>{tr(title)}</span>
          </button>
        ))}
      </nav>
      {notice && (
        <div className="toast" role="status">
          <span>{tr(notice)}</span>
          <button
            className="icon-button"
            aria-label={tr("Chiudi avviso")}
            onClick={() => setNotice("")}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {editProfile && (
        <Modal
          title={tr("Riconfigura profilo")}
          onClose={() => setEditProfile(false)}
        >
          <Onboarding
            onDone={() => setEditProfile(false)}
            onCancel={() => setEditProfile(false)}
          />
        </Modal>
      )}
      {choose && (
        <Modal
          title={
            choose === "car"
              ? tr("Dov’è la tua auto?")
              : tr("Un nuovo punto nel bosco")
          }
          onClose={() => setChoose(null)}
        >
          <p className="modal-description">
            {" "}
            {tr(
              "Usa la posizione attuale oppure scegli un punto preciso sulla mappa.",
            )}{" "}
          </p>
          <div className="location-choices">
            <button
              className="choice-button"
              onClick={() => chooseLocation(choose, "gps")}
            >
              <Crosshair size={25} />
              <span>
                <strong>{tr("La mia posizione")}</strong>
                <small>{tr("Con il GPS del dispositivo")}</small>
              </span>
              <ChevronRight size={20} />
            </button>
            <button
              className="choice-button"
              onClick={() => chooseLocation(choose, "map")}
            >
              <MapPin size={25} />
              <span>
                <strong>{tr("Scegli sulla mappa")}</strong>
                <small>{tr("Per segnare anche un posto lontano")}</small>
              </span>
              <ChevronRight size={20} />
            </button>
          </div>
        </Modal>
      )}
      {sos && (
        <SosPanel
          fix={gps.fix}
          now={now}
          pending={gps.pending}
          error={gps.error}
          onLocate={locateForInfo}
          onClose={() => setSos(false)}
        />
      )}
      {mycoMode && mycoPoint && mycoCard && !pick && (
        <MycoScoreCard
          point={mycoPoint}
          sample={mycoSample}
          initialProfile={mycoProfile}
          onClose={() => setMycoCard(false)}
        />
      )}
      {draft && (
        <FindForm
          draft={draft}
          onClose={() => setDraft(null)}
          finds={data.finds}
          onSave={async (find, photos) => {
            if (!draft.find && data.finds.length >= 10000) {
              setNotice(
                tr(
                  "Limite di 10.000 punti raggiunto. Esporta un backup e libera il taccuino.",
                ),
              );
              return false;
            }
            const ok = await update(
              (old) => ({
                ...old,
                finds: draft.find
                  ? old.finds.map((f) =>
                      f.id === find.id
                        ? find
                        : f.spotId === find.id && find.kind !== "spot"
                          ? { ...f, spotId: undefined }
                          : f,
                    )
                  : [find, ...old.finds],
              }),
              { findingId: find.id, photos },
            );
            if (!ok) return false;
            center(find);
            setNotice(tr("Punto salvato nel tuo taccuino."));
            return true;
          }}
        />
      )}
      {detail && (
        <Modal title={detail.title} onClose={() => setDetail(null)}>
          <span className="detail-badge">
            {detail.kind === "spot" ? tr("Fungaia") : tr("Ritrovamento")} ·{" "}
            {dateLabel(detail.createdAt)}
          </span>
          <FindingDetails
            find={detail}
            finds={data.finds}
            photos={photoMeta.filter((p) => p.findingId === detail.id)}
            onOpen={setDetail}
            onAdd={() => {
              setDraft({
                coordinate: detail,
                source: "map",
                accuracy: null,
                altitudeM: detail.altitudeM,
                spotId: detail.id,
              });
              setDetail(null);
            }}
          />
          <p className="detail-notes">
            {detail.notes || tr("Nessuna nota aggiunta.")}
          </p>
          <div className="coordinate-box">
            <MapPin size={18} />
            <span>
              {detail.lat.toFixed(6)}, {detail.lng.toFixed(6)}
              <small>
                {detail.source === "gps"
                  ? tr("Salvato con GPS · ±{{accuracy}}", {
                      accuracy: metres(detail.accuracy ?? 0),
                    })
                  : tr("Scelto sulla mappa")}
              </small>
            </span>
          </div>
          <div className="modal-actions">
            <button
              className="button primary"
              onClick={() => {
                setDraft({
                  coordinate: detail,
                  source: detail.source,
                  accuracy: detail.accuracy,
                  find: detail,
                });
                setDetail(null);
              }}
            >
              {" "}
              {tr("Modifica punto")}{" "}
            </button>
            <button
              className="button danger-outline"
              onClick={() => {
                const id = detail.id;
                setDetail(null);
                setConfirm({
                  title: tr("Elimina questo punto?"),
                  text: tr(
                    "Il punto e tutte le sue foto saranno eliminati. I ritrovamenti associati resteranno nel taccuino.",
                  ),
                  label: tr("Elimina punto"),
                  danger: true,
                  action: () =>
                    update((old) => ({
                      ...old,
                      finds: old.finds
                        .filter((f) => f.id !== id)
                        .map((f) =>
                          f.spotId === id ? { ...f, spotId: undefined } : f,
                        ),
                    })),
                });
              }}
            >
              <Trash2 size={17} /> {tr("Elimina")}{" "}
            </button>
          </div>
        </Modal>
      )}
      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)}>
          <p className="modal-description">{confirm.text}</p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setConfirm(null)}
            >
              {" "}
              {tr("Annulla")}{" "}
            </button>
            <button
              className={`button ${confirm.danger ? "danger" : "primary"}`}
              onClick={() => {
                const action = confirm.action;
                setConfirm(null);
                action();
              }}
            >
              {confirm.label}
            </button>
          </div>
        </Modal>
      )}
      {help && (
        <Modal
          title={tr("Prima di entrare nel bosco")}
          onClose={() => setHelp(false)}
        >
          <div className="guide-item">
            <CarFront />
            <div>
              <h3>{tr("Segna il punto di partenza")}</h3>
              <p>
                {" "}
                {tr(
                  "Salva l’auto prima di avviare l’uscita. Ogni uscita mantiene il proprio punto auto.",
                )}{" "}
              </p>
            </div>
          </div>
          <div className="guide-item">
            <Footprints />
            <div>
              <h3>{tr("Tieni MycoTrail aperta")}</h3>
              <p>
                {" "}
                {tr(
                  "Se cambi app o blocchi lo schermo, la registrazione viene messa in pausa. Al ritorno tocca Riprendi. Le interruzioni non vengono collegate con linee inventate.",
                )}{" "}
              </p>
            </div>
          </div>
          <div className="guide-item">
            <Map />
            <div>
              <h3>{tr("La mappa richiede connessione")}</h3>
              <p>
                {" "}
                {tr(
                  "Dopo il primo caricamento completo, l’interfaccia può riaprirsi offline. Punti e tracce sono locali, ma la cartografia non viene scaricata per l’uso offline.",
                )}{" "}
              </p>
            </div>
          </div>
          <div className="guide-item">
            <Flag />
            <div>
              <h3>{tr("Ritorna lungo i tuoi passi")}</h3>
              <p>
                {" "}
                {tr(
                  "Il ritorno mostra la traccia registrata e il punto auto. La distanza è in linea d’aria, non un itinerario da seguire. Questa prima versione va provata su percorsi conosciuti.",
                )}{" "}
              </p>
            </div>
          </div>
          <button
            className="button primary full"
            onClick={() => setHelp(false)}
          >
            <Check size={18} /> {tr("Ho capito, esploriamo")}{" "}
          </button>
        </Modal>
      )}
    </div>
  );
}
function Empty({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="empty-state">
      <span>{icon}</span>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
