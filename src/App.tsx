import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
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
import {
  addFix,
  clock,
  dateLabel,
  distance,
  duration,
  metres,
  openTrip,
  pauseTrip,
  recoverData,
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
import { download } from "./lib/storage";

type Page = "map" | "finds" | "trips" | "settings";
type Draft = {
  coordinate: Coordinate;
  source: "gps" | "map";
  accuracy: number | null;
  find?: Find;
};
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
  const { data, update, error: storageError, saving, locked } = useData();
  const [page, setPage] = useState<Page>("map");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now());
  const [online, setOnline] = useState(navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [request, setRequest] = useState<MapViewRequest | null>(null);
  const [pick, setPick] = useState<"find" | "car" | null>(null);
  const [choose, setChoose] = useState<"find" | "car" | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [detail, setDetail] = useState<Find | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [help, setHelp] = useState(false);
  const [returning, setReturning] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "find" | "spot">("all");
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
  const active = data ? openTrip(data) : undefined;
  const viewedTrip = data?.trips.find((t) => t.id === selectedTrip) ?? active;
  const car = viewedTrip ? viewedTrip.car : (data?.car ?? null);
  const fresh = usableFix(gps.fix, now);
  const recording = active?.status === "active";
  useEffect(() => {
    if (!data || initializedView.current) return;
    initializedView.current = true;
    const last = openTrip(data)?.points.at(-1) ?? data.car ?? data.finds[0];
    if (last) setRequest({ id: Date.now(), center: last });
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
  async function withFix(action: (fix: Fix) => void) {
    setBusy(true);
    try {
      const fix = await gps.locate();
      if (!usableFix(fix)) {
        setNotice(
          `GPS ancora impreciso (±${Math.round(fix.accuracy)} m). Attendi un segnale entro 50 m oppure scegli il punto sulla mappa.`,
        );
        return;
      }
      action(fix);
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function start() {
    if (data && data.trips.length >= 500) {
      setNotice(
        "Limite di 500 uscite raggiunto. Esporta un backup e rimuovi alcune uscite.",
      );
      return;
    }
    void withFix((fix) => {
      const stamp = Date.now();
      update((old) => {
        if (openTrip(old) || old.trips.length >= 500) return old;
        const trip: Trip = {
          id: crypto.randomUUID(),
          name: `Uscita del ${dateLabel(stamp)}`,
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
        "Registrazione avviata. Tieni MycoTrail visibile durante l’uscita.",
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
      setNotice("Registrazione ripresa in un nuovo tratto.");
    });
  }
  function stop() {
    setConfirm({
      title: "Concludi questa uscita?",
      text: "Il percorso rimarrà nelle tue uscite. Potrai rivederlo ed esportarlo quando vuoi.",
      label: "Concludi e salva",
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
        setNotice("Uscita conclusa. Trovi il percorso in Le mie uscite.");
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
    setNotice("Posizione auto salvata.");
  }
  function chooseLocation(kind: "find" | "car", source: "gps" | "map") {
    setChoose(null);
    if (source === "map") {
      setPage("map");
      setPick(kind);
      return;
    }
    void withFix((fix) => {
      if (kind === "car") saveCar(fix, fix.accuracy);
      else setDraft({ coordinate: fix, source: "gps", accuracy: fix.accuracy });
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
  function backup() {
    if (data)
      download(
        JSON.stringify(data, null, 2),
        `mycotrail-backup-${new Date().toISOString().slice(0, 10)}.json`,
        "application/json",
      );
  }
  async function importBackup(file?: File) {
    if (!file) return;
    try {
      if (file.size > 25 * 1024 * 1024)
        throw new Error("Il file supera 25 MB.");
      const imported = recoverData(JSON.parse(await file.text()));
      setConfirm({
        title: "Ripristina il backup?",
        text: `Contiene ${imported.finds.length} punti e ${imported.trips.length} uscite. Sostituirà i dati presenti su questo dispositivo: esporta prima un backup se vuoi conservarli.`,
        label: "Ripristina dati",
        action: () => {
          update(() => imported);
          setSelectedTrip(null);
          setReturning(false);
          setNotice("Backup ripristinato. Le uscite aperte sono in pausa.");
        },
      });
    } catch {
      setNotice(
        "Backup non valido o troppo grande. Scegli un file JSON esportato da MycoTrail (massimo 25 MB).",
      );
    }
  }

  if (!data)
    return (
      <div className="loading">
        <Brand />
        <h1>
          {locked
            ? "MycoTrail è già aperta"
            : storageError
              ? "Non riusciamo ad aprire il taccuino"
              : "Apriamo il tuo taccuino…"}
        </h1>
        <p>
          {locked
            ? "Chiudi l’altra scheda di MycoTrail, poi ricarica questa pagina."
            : storageError || "Un momento, prepariamo la mappa."}
        </p>
        {(locked || storageError) && (
          <button className="button primary" onClick={() => location.reload()}>
            Riprova
          </button>
        )}
      </div>
    );
  const shownFinds = data.finds.filter(
    (f) =>
      (filter === "all" || f.kind === filter) &&
      `${f.title} ${f.notes}`.toLowerCase().includes(query.toLowerCase()),
  );
  const totalDistance = data.trips.reduce(
    (total, t) => total + trackDistance(t),
    0,
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-section-label">IL TUO TACCUINO</div>
        <nav aria-label="Navigazione principale">
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
              <span>{title}</span>
              {key === "finds" && data.finds.length > 0 && (
                <span className="nav-count">{data.finds.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Trees size={30} />
            <strong>Ogni uscita, una scoperta.</strong>
            <p>
              Custodisci i tuoi luoghi.
              <br />
              Lascia al bosco la sua bellezza.
            </p>
          </div>
          <button className="local-profile" onClick={() => setPage("settings")}>
            <span className="avatar">
              <Leaf size={19} />
            </span>
            <span>
              <strong>Il mio taccuino</strong>
              <small>Salvato su questo dispositivo</small>
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
            Il tuo spazio <ChevronRight size={14} />
            <strong>{tabs.find((t) => t.key === page)?.title}</strong>
          </div>
          <div className="topbar-right">
            <span className="version-pill">PRIMA EDIZIONE</span>
            <button
              className="icon-button help-button"
              aria-label="Come funziona MycoTrail"
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
                  ? "IL PROSSIMO SENTIERO TI ASPETTA"
                  : page === "finds"
                    ? "I LUOGHI CHE VALE LA PENA RICORDARE"
                    : page === "trips"
                      ? "UN PASSO DOPO L’ALTRO"
                      : "IL TUO SPAZIO, LE TUE SCELTE"}
              </div>
              <h1>
                {page === "map"
                  ? "Ci vediamo nel bosco."
                  : page === "finds"
                    ? "Il tuo piccolo tesoro."
                    : page === "trips"
                      ? "Storie di sentieri."
                      : "Pronti a partire."}
              </h1>
              <p>
                {page === "map"
                  ? "Segui il tuo percorso. Ritrova i tuoi posti."
                  : page === "finds"
                    ? "Ritrovamenti e fungaie, custoditi nel tuo taccuino."
                    : page === "trips"
                      ? "Ogni percorso rimane qui, pronto da ripercorrere."
                      : "Gestisci i dati e porta MycoTrail sempre con te."}
              </p>
            </div>
            {page === "map" ? (
              <div className={`gps-badge ${fresh ? "good" : ""}`}>
                <span />
                {fresh
                  ? `GPS · ±${Math.round(gps.fix!.accuracy)} m`
                  : gps.pending
                    ? "Ricerca GPS…"
                    : gps.enabled
                      ? "In attesa del GPS"
                      : "GPS da attivare"}
              </div>
            ) : page === "finds" ? (
              <button
                className="button primary"
                onClick={() => setChoose("find")}
              >
                <Plus size={18} />
                Nuovo punto
              </button>
            ) : page === "trips" ? (
              <div className="total-distance">
                <Footprints size={20} />
                {metres(totalDistance)} esplorati
              </div>
            ) : null}
          </div>
          {storageError && (
            <div className="banner error" role="alert">
              {storageError}
              <button onClick={backup}>Esporta backup</button>
            </div>
          )}
          {!online && (
            <div className="banner">
              <WifiOff size={18} />
              Sei offline. I dati restano sul dispositivo; nuove aree della
              mappa richiedono internet.
            </div>
          )}
          <section
            className={`explore-layout ${page !== "map" ? "hidden" : ""}`}
            aria-label="Esplora la mappa"
          >
            <div className="map-card">
              <div className="map-top-label">
                <span className="map-layer">
                  <Layers size={16} />
                  Mappa sentieri
                </span>
                <span className="map-area">
                  {gps.fix
                    ? `${gps.fix.lat.toFixed(3)}°, ${gps.fix.lng.toFixed(3)}°`
                    : "Vista iniziale · Valdarno"}
                </span>
              </div>
              <div className="map-stage">
                <MapView
                  fix={gps.fix}
                  car={car}
                  finds={data.finds}
                  trip={viewedTrip}
                  request={request}
                  picking={!!pick}
                  onPick={onPick}
                  onFind={setDetail}
                  visible={page === "map"}
                />
                <button
                  className="locate-button"
                  aria-label="Centra sulla mia posizione"
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
                      Tocca la mappa per{" "}
                      {pick === "car"
                        ? "segnare l’auto"
                        : "aggiungere un punto"}
                    </span>
                    <button
                      className="icon-button"
                      aria-label="Annulla selezione"
                      onClick={() => setPick(null)}
                    >
                      <X size={18} />
                    </button>
                  </div>
                )}
                {!gps.enabled && !pick && (
                  <div className="map-intro">
                    <span className="intro-icon">
                      <Navigation size={22} />
                    </span>
                    <div>
                      <strong>Il bosco comincia da qui.</strong>
                      <p>Attiva la posizione per orientarti sulla mappa.</p>
                    </div>
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() => {
                        void withFix(center);
                      }}
                    >
                      {busy ? "Ricerca…" : "Attiva GPS"}
                      <ArrowRight size={16} />
                    </button>
                  </div>
                )}
              </div>
              <div className="map-legend">
                <span>
                  <i className="legend-dot blue" />
                  Tu
                </span>
                <span>
                  <i className="legend-dot green" />
                  Auto
                </span>
                <span>
                  <i className="legend-dot orange" />
                  Ritrovamento
                </span>
                <span>
                  <Star size={12} />
                  Fungaia
                </span>
                <span className="local-save">
                  <ShieldCheck size={14} />
                  {saving
                    ? "Salvataggio…"
                    : storageError
                      ? "Dati non salvati"
                      : "Dati sul dispositivo"}
                </span>
              </div>
            </div>
            <aside className="outing-panel">
              {returning ? (
                <div className="outing-card return-card">
                  <div className="card-eyebrow">
                    <Navigation size={16} />
                    VERSO L’AUTO
                  </div>
                  <h2>Ripercorri i tuoi passi.</h2>
                  <p>
                    Segui sulla mappa i tratti arancioni che hai registrato.
                  </p>
                  {car && gps.fix && (
                    <div className="return-distance">
                      {metres(distance(gps.fix, car))}
                      <small>in linea d’aria dall’ultima posizione</small>
                    </div>
                  )}
                  <div className="info-note">
                    {viewedTrip?.points.length
                      ? "La traccia può avere interruzioni. Non viene calcolato un percorso pedonale."
                      : "Non c’è una traccia registrata per questa auto. Il segnaposto indica solo la sua posizione."}
                  </div>
                  <button
                    className="button secondary full"
                    onClick={() => fit(viewedTrip)}
                  >
                    Inquadra auto e traccia
                  </button>
                  <button
                    className="text-button full"
                    onClick={() => setReturning(false)}
                  >
                    <ArrowLeft size={16} />
                    Torna all’esplorazione
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
                        ? "USCITA IN CORSO"
                        : "USCITA IN PAUSA"
                      : "LA TUA PROSSIMA USCITA"}
                  </div>
                  <h2>
                    {active
                      ? "Un passo alla volta."
                      : "Prenditi un po’ di bosco."}
                  </h2>
                  <p>
                    {active
                      ? recording
                        ? "Stiamo custodendo il tuo percorso."
                        : "La traccia è salvata. Riparti quando vuoi."
                      : "Avvia il percorso e lascia spazio alla scoperta."}
                  </p>
                  <div className="trip-stats">
                    <div>
                      <strong>
                        {active
                          ? (trackDistance(active) / 1000).toLocaleString(
                              "it-IT",
                              { maximumFractionDigits: 2 },
                            )
                          : "0,00"}
                        <small> km</small>
                      </strong>
                      <span>
                        <Footprints size={13} />
                        Percorso
                      </span>
                    </div>
                    <div>
                      <strong>
                        {active ? clock(duration(active, now)) : "00:00"}
                      </strong>
                      <span>
                        <Route size={13} />
                        Tempo attivo
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
                        {recording ? "Pausa" : "Riprendi"}
                      </button>
                      <button className="button secondary" onClick={stop}>
                        <Square size={15} />
                        Concludi
                      </button>
                    </div>
                  ) : (
                    <button
                      className="button primary full"
                      disabled={busy}
                      onClick={start}
                    >
                      <Play size={18} />
                      {busy ? "Cerchiamo il GPS…" : "Avvia uscita"}
                      <ArrowRight size={17} />
                    </button>
                  )}
                  <div className="record-hint">
                    {recording && !fresh
                      ? "Segnale GPS assente o impreciso: in attesa di una posizione valida."
                      : active?.points.length === 100000
                        ? "Limite traccia raggiunto. Concludi l’uscita e avviane una nuova."
                        : "Tieni l’app visibile. In background l’uscita va in pausa."}
                  </div>
                </div>
              )}
              <div className="quick-actions">
                <button disabled={busy} onClick={() => setChoose("find")}>
                  <span className="action-icon orange">
                    <Plus size={23} />
                  </span>
                  <span>
                    <strong>Segna un punto</strong>
                    <small>Un ritrovamento, un posto speciale</small>
                  </span>
                  <ChevronRight size={18} />
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    data.car
                      ? setConfirm({
                          title: "Aggiorna la posizione auto?",
                          text: "Il punto auto attuale sarà sostituito. Le uscite concluse conserveranno il loro punto originale.",
                          label: "Scegli nuova posizione",
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
                      {data.car ? "Auto salvata" : "Salva l’auto"}
                    </strong>
                    <small>
                      {data.car
                        ? `Posizione del ${dateLabel(data.car.savedAt)}`
                        : "Il tuo punto di partenza"}
                    </small>
                  </span>
                  <ChevronRight size={18} />
                </button>
                <button onClick={goBack}>
                  <span className="action-icon sand">
                    <Navigation size={21} />
                  </span>
                  <span>
                    <strong>Torna all’auto</strong>
                    <small>Ritrova il percorso registrato</small>
                  </span>
                  <ChevronRight size={18} />
                </button>
              </div>
              {viewedTrip && viewedTrip.id !== active?.id && (
                <div className="selected-trip">
                  <Route size={17} />
                  <span>Stai vedendo: {viewedTrip.name}</span>
                  <button
                    className="icon-button"
                    aria-label="Nascondi percorso"
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
                  {gps.error}
                </div>
              )}
              <div className="forest-note">
                <Leaf size={18} />
                <span>
                  I posti migliori sono quelli
                  <br />
                  che impari a riconoscere.
                </span>
              </div>
            </aside>
            <section className="recent-section">
              <div className="section-heading">
                <h2>
                  I tuoi ultimi punti <span>{data.finds.length}</span>
                </h2>
                <button
                  className="text-button"
                  onClick={() => setPage("finds")}
                >
                  Il taccuino
                  <ArrowRight size={15} />
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
                          {f.kind === "spot" ? "Fungaia" : "Ritrovamento"}
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
                    <strong>Il tuo primo punto ti aspetta.</strong>
                    <p>
                      Salva un ritrovamento o una fungaia: li ritroverai qui.
                    </p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setChoose("find")}
                  >
                    Aggiungi un punto
                    <Plus size={16} />
                  </button>
                </div>
              )}
            </section>
          </section>
          {page === "finds" && (
            <section>
              <div className="list-toolbar">
                <div className="filters" aria-label="Filtra punti">
                  {(["all", "find", "spot"] as const).map((f) => (
                    <button
                      key={f}
                      className={filter === f ? "selected" : ""}
                      onClick={() => setFilter(f)}
                    >
                      {f === "all"
                        ? "Tutti"
                        : f === "find"
                          ? "Ritrovamenti"
                          : "Fungaie"}
                    </button>
                  ))}
                </div>
                <label className="search-input">
                  <Search size={18} />
                  <input
                    aria-label="Cerca nei punti"
                    placeholder="Cerca nel taccuino…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              {shownFinds.length ? (
                <div className="find-grid">
                  {shownFinds.map((f) => (
                    <article className="find-card" key={f.id}>
                      <div className={`find-card-top ${f.kind}`}>
                        <span>
                          {f.kind === "spot" ? (
                            <Trees size={43} />
                          ) : (
                            <Leaf size={43} />
                          )}
                        </span>
                        <span className="find-kind">
                          {f.kind === "spot" ? "Fungaia" : "Ritrovamento"}
                        </span>
                      </div>
                      <div className="find-card-content">
                        <small>{dateLabel(f.createdAt)}</small>
                        <h2>{f.title}</h2>
                        <p>{f.notes || "Un luogo da ricordare."}</p>
                        <button
                          className="text-button"
                          onClick={() => {
                            center(f);
                            setDetail(f);
                          }}
                        >
                          Apri sulla mappa
                          <ArrowRight size={16} />
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
                      ? "Nessun punto trovato."
                      : "Il taccuino è tutto da scrivere."
                  }
                  text={
                    data.finds.length
                      ? "Prova un altro nome o cambia filtro."
                      : "Aggiungi un punto usando il GPS o scegliendolo sulla mappa."
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
                          ? "CONCLUSA"
                          : t.status === "active"
                            ? "IN CORSO"
                            : "IN PAUSA"}
                      </span>
                      <h2>{t.name}</h2>
                      <p>
                        {dateLabel(t.startedAt)} · {t.points.length} posizioni ·{" "}
                        {segments(t.points).length} tratti
                      </p>
                    </div>
                    <div className="trip-row-stat">
                      <strong>{metres(trackDistance(t))}</strong>
                      <small>{clock(duration(t, now))} ore</small>
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
                        <Map size={17} />
                        Vedi
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Esporta GPX ${t.name}`}
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
                          aria-label={`Elimina ${t.name}`}
                          onClick={() =>
                            setConfirm({
                              title: "Elimina questa uscita?",
                              text: "Il percorso sarà rimosso da questo dispositivo. I ritrovamenti rimarranno nel taccuino.",
                              label: "Elimina uscita",
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
                  title="Il primo sentiero è ancora da percorrere."
                  text="Tocca Avvia uscita nella mappa per registrare il tuo percorso."
                />
              )}
            </section>
          )}
          {page === "settings" && (
            <section className="settings-grid">
              <article className="settings-card">
                <span className="action-icon green">
                  <ShieldCheck size={23} />
                </span>
                <h2>I tuoi posti restano tuoi.</h2>
                <p>
                  Punti e percorsi sono salvati solo in questo browser, su
                  questo dispositivo. Non hai ancora un account e non vengono
                  sincronizzati.
                </p>
                <p>
                  Se cancelli i dati del sito o cambi dispositivo, puoi
                  perderli. Esporta periodicamente un backup.
                </p>
                <button className="button primary" onClick={backup}>
                  <ArrowDownToLine size={17} />
                  Esporta backup
                </button>
                <button
                  className="button secondary"
                  disabled={!!active}
                  onClick={() => importRef.current?.click()}
                >
                  <ArrowUpFromLine size={17} />
                  Importa backup
                </button>
                {active && (
                  <small>Concludi l’uscita prima di importare un backup.</small>
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
                <h2>MycoTrail sul tuo iPhone.</h2>
                <ol>
                  <li>
                    Apri il sito in <strong>Safari</strong>.
                  </li>
                  <li>
                    Tocca <strong>Condividi</strong>.
                  </li>
                  <li>
                    Scegli <strong>Aggiungi alla schermata Home</strong>.
                  </li>
                  <li>Apri MycoTrail e consenti la posizione.</li>
                </ol>
                <p>
                  Durante la registrazione tieni l’app in primo piano. Proviamo
                  a mantenere lo schermo acceso quando il browser lo consente.
                </p>
                <button className="text-button" onClick={() => setHelp(true)}>
                  Leggi la guida
                  <ArrowRight size={16} />
                </button>
              </article>
              <article className="settings-card wide">
                <span className="mini-label">MYCOTRAIL · VERSIONE 0.2</span>
                <h2>Un inizio, con i piedi per terra.</h2>
                <p>
                  La prima versione include mappa, GPS, uscite, ritrovamenti e
                  backup. Account, Squad, foto e mappe scaricabili arriveranno
                  nelle prossime fasi.
                </p>
                <p>
                  La cartografia viene caricata da OpenStreetMap: il fornitore
                  riceve le normali richieste web per l’area visualizzata. L’app
                  non invia a un nostro server le tue fungaie o le tue tracce.
                </p>
              </article>
            </section>
          )}
          <footer className="page-footer">
            <Brand compact />
            <span>Prenditi cura dei tuoi luoghi.</span>
            <span>MycoTrail · Fatto per esplorare</span>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Navigazione mobile">
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
            <span>{title}</span>
          </button>
        ))}
      </nav>
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button
            className="icon-button"
            aria-label="Chiudi avviso"
            onClick={() => setNotice("")}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {choose && (
        <Modal
          title={
            choose === "car" ? "Dov’è la tua auto?" : "Un nuovo punto nel bosco"
          }
          onClose={() => setChoose(null)}
        >
          <p className="modal-description">
            Usa la posizione attuale oppure scegli un punto preciso sulla mappa.
          </p>
          <div className="location-choices">
            <button
              className="choice-button"
              onClick={() => chooseLocation(choose, "gps")}
            >
              <Crosshair size={25} />
              <span>
                <strong>La mia posizione</strong>
                <small>Con il GPS del dispositivo</small>
              </span>
              <ChevronRight size={20} />
            </button>
            <button
              className="choice-button"
              onClick={() => chooseLocation(choose, "map")}
            >
              <MapPin size={25} />
              <span>
                <strong>Scegli sulla mappa</strong>
                <small>Per segnare anche un posto lontano</small>
              </span>
              <ChevronRight size={20} />
            </button>
          </div>
        </Modal>
      )}
      {draft && (
        <FindForm
          draft={draft}
          onClose={() => setDraft(null)}
          onSave={(find) => {
            if (!draft.find && data.finds.length >= 10000) {
              setNotice(
                "Limite di 10.000 punti raggiunto. Esporta un backup e libera il taccuino.",
              );
              return;
            }
            update((old) => ({
              ...old,
              finds: draft.find
                ? old.finds.map((f) => (f.id === find.id ? find : f))
                : [find, ...old.finds],
            }));
            setDraft(null);
            center(find);
            setNotice("Punto salvato nel tuo taccuino.");
          }}
        />
      )}
      {detail && (
        <Modal title={detail.title} onClose={() => setDetail(null)}>
          <span className="detail-badge">
            {detail.kind === "spot" ? "Fungaia" : "Ritrovamento"} ·{" "}
            {dateLabel(detail.createdAt)}
          </span>
          <p className="detail-notes">
            {detail.notes || "Nessuna nota aggiunta."}
          </p>
          <div className="coordinate-box">
            <MapPin size={18} />
            <span>
              {detail.lat.toFixed(6)}, {detail.lng.toFixed(6)}
              <small>
                {detail.source === "gps"
                  ? `Salvato con GPS · ±${Math.round(detail.accuracy ?? 0)} m`
                  : "Scelto sulla mappa"}
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
              Modifica punto
            </button>
            <button
              className="button danger-outline"
              onClick={() => {
                const id = detail.id;
                setDetail(null);
                setConfirm({
                  title: "Elimina questo punto?",
                  text: "Il ritrovamento sarà rimosso dal taccuino su questo dispositivo.",
                  label: "Elimina punto",
                  danger: true,
                  action: () =>
                    update((old) => ({
                      ...old,
                      finds: old.finds.filter((f) => f.id !== id),
                    })),
                });
              }}
            >
              <Trash2 size={17} />
              Elimina
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
              Annulla
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
          title="Prima di entrare nel bosco"
          onClose={() => setHelp(false)}
        >
          <div className="guide-item">
            <CarFront />
            <div>
              <h3>Segna il punto di partenza</h3>
              <p>
                Salva l’auto prima di avviare l’uscita. Ogni uscita mantiene il
                proprio punto auto.
              </p>
            </div>
          </div>
          <div className="guide-item">
            <Footprints />
            <div>
              <h3>Tieni MycoTrail aperta</h3>
              <p>
                Se cambi app o blocchi lo schermo, la registrazione viene messa
                in pausa. Al ritorno tocca Riprendi. Le interruzioni non vengono
                collegate con linee inventate.
              </p>
            </div>
          </div>
          <div className="guide-item">
            <Map />
            <div>
              <h3>La mappa richiede connessione</h3>
              <p>
                Dopo il primo caricamento completo, l’interfaccia può riaprirsi
                offline. Punti e tracce sono locali, ma la cartografia non viene
                scaricata per l’uso offline.
              </p>
            </div>
          </div>
          <div className="guide-item">
            <Flag />
            <div>
              <h3>Ritorna lungo i tuoi passi</h3>
              <p>
                Il ritorno mostra la traccia registrata e il punto auto. La
                distanza è in linea d’aria, non un itinerario da seguire. Questa
                prima versione va provata su percorsi conosciuti.
              </p>
            </div>
          </div>
          <button
            className="button primary full"
            onClick={() => setHelp(false)}
          >
            <Check size={18} />
            Ho capito, esploriamo
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
function FindForm({
  draft,
  onClose,
  onSave,
}: {
  draft: Draft;
  onClose: () => void;
  onSave: (find: Find) => void;
}) {
  const [kind, setKind] = useState<"find" | "spot">(draft.find?.kind ?? "find");
  const [title, setTitle] = useState(draft.find?.title ?? "");
  const [notes, setNotes] = useState(draft.find?.notes ?? "");
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      id: draft.find?.id ?? crypto.randomUUID(),
      lat: draft.coordinate.lat,
      lng: draft.coordinate.lng,
      kind,
      title: title.trim(),
      notes: notes.trim(),
      source: draft.source,
      accuracy: draft.accuracy,
      createdAt: draft.find?.createdAt ?? Date.now(),
    });
  }
  return (
    <Modal
      title={draft.find ? "Modifica il tuo punto" : "Un posto da ricordare"}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="kind-toggle">
          <button
            type="button"
            className={kind === "find" ? "selected" : ""}
            onClick={() => setKind("find")}
          >
            <MapPin size={18} />
            Ritrovamento
          </button>
          <button
            type="button"
            className={kind === "spot" ? "selected" : ""}
            onClick={() => setKind("spot")}
          >
            <Star size={18} />
            Fungaia
          </button>
        </div>
        <label className="field">
          Nome del punto
          <input
            autoFocus
            required
            maxLength={80}
            placeholder={
              kind === "find"
                ? "Es. Porcini sotto il castagno"
                : "Es. La fungaia del sentiero alto"
            }
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="field">
          Le tue note <span>(facoltative)</span>
          <textarea
            maxLength={1000}
            rows={4}
            placeholder="Alberi vicini, terreno, dettagli da ricordare…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <div className="coordinate-box">
          <MapPin size={17} />
          {draft.coordinate.lat.toFixed(5)}, {draft.coordinate.lng.toFixed(5)}
          <span className="coordinate-source">
            {draft.source === "gps" ? "GPS" : "Mappa"}
          </span>
        </div>
        <button
          className="button primary full"
          type="submit"
          disabled={!title.trim()}
        >
          <Check size={18} />
          Salva punto
        </button>
      </form>
    </Modal>
  );
}
