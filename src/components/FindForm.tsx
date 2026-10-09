import { useEffect, useRef, useState, type FormEvent } from "react";
import { Modal } from "./Modal";
import { PhotoImage } from "./FindingPhotos";
import { usePreferences } from "../hooks/usePreferences";
import { type Coordinate, type Find, findSchema } from "../lib/model";
import { readPhotoMeta } from "../lib/storage";
import { compressPhoto, MAX_PHOTOS, type PhotoEdit } from "../lib/photos";
import {
  habitats,
  habitatLabels,
  soils,
  soilLabels,
  aspects,
} from "../lib/findings";
import { feetToMetres, metresToFeet, kgToLb, lbToKg } from "../lib/units";
export type FindingDraft = {
  coordinate: Coordinate;
  source: "gps" | "map";
  accuracy: number | null;
  find?: Find;
  altitudeM?: number;
  spotId?: string;
};
export function FindForm({
  draft,
  finds,
  onClose,
  onSave,
}: {
  draft: FindingDraft;
  finds: Find[];
  onClose: () => void;
  onSave: (find: Find, photos: PhotoEdit[]) => Promise<boolean>;
}) {
  const { tr, settings } = usePreferences();
  const p = settings.preferences;
  const old = draft.find;
  const [id] = useState(() => old?.id ?? crypto.randomUUID());
  const [kind, setKind] = useState<Find["kind"]>(old?.kind ?? "find");
  const [title, setTitle] = useState(old?.title ?? "");
  const [notes, setNotes] = useState(old?.notes ?? "");
  const [quantity, setQuantity] = useState(old?.quantity?.toString() ?? "");
  const [weightUnit, setWeightUnit] = useState(
    p.weightUnit === "imperial" ? "lb" : "kg",
  );
  const [weight, setWeight] = useState(
    old?.weightKg === undefined
      ? ""
      : String(
          p.weightUnit === "imperial" ? kgToLb(old.weightKg) : old.weightKg,
        ),
  );
  const [altitude, setAltitude] = useState(() => {
    const m = old?.altitudeM ?? draft.altitudeM;
    return m === undefined
      ? ""
      : String(p.altitudeUnit === "ft" ? metresToFeet(m) : m);
  });
  const [environment, setEnvironment] = useState(old?.habitats ?? []);
  const [soil, setSoil] = useState(old?.soil ?? "");
  const [aspect, setAspect] = useState(old?.aspect ?? "");
  const [spotId, setSpotId] = useState(old?.spotId ?? draft.spotId ?? "");
  const [photos, setPhotos] = useState<PhotoEdit[]>([]);
  const [loading, setLoading] = useState(!!old);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(true);
  const working = useRef(false);
  useEffect(() => {
    alive.current = true;
    if (old)
      void readPhotoMeta(old.id)
        .then((rows) => {
          if (alive.current) {
            setPhotos(rows);
            setLoading(false);
          }
        })
        .catch(() => {
          if (alive.current)
            setError("Impossibile leggere le foto. Riapri la scheda.");
        });
    return () => {
      alive.current = false;
    };
  }, [old]);
  const grams = (value: number, unit: string) =>
    unit === "kg"
      ? value
      : unit === "g"
        ? value / 1000
        : unit === "lb"
          ? lbToKg(value)
          : lbToKg(value / 16);
  async function add(files: FileList | null) {
    if (!files || working.current) return;
    if (files.length + photos.length > MAX_PHOTOS) {
      setError("Massimo 8 foto per ritrovamento.");
      return;
    }
    working.current = true;
    setBusy(true);
    setError("");
    try {
      const added: PhotoEdit[] = [];
      for (const file of Array.from(files))
        added.push(await compressPhoto(file, id));
      if (alive.current)
        setPhotos((current) =>
          [...current, ...added].map((photo, i) => ({
            ...photo,
            primary: current.length ? photo.primary : i === 0,
          })),
        );
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (working.current || loading) return;
    setBusy(true);
    working.current = true;
    setError("");
    try {
      const find = findSchema.parse({
        ...old,
        id,
        kind,
        title: title.trim(),
        notes: notes.trim(),
        lat: draft.coordinate.lat,
        lng: draft.coordinate.lng,
        source: draft.source,
        accuracy: draft.accuracy,
        createdAt: old?.createdAt ?? Date.now(),
        quantity: quantity === "" ? undefined : Number(quantity),
        weightKg: weight === "" ? undefined : grams(Number(weight), weightUnit),
        altitudeM:
          altitude === ""
            ? undefined
            : p.altitudeUnit === "ft"
              ? feetToMetres(Number(altitude))
              : Number(altitude),
        habitats: environment,
        soil: soil || undefined,
        aspect: aspect || undefined,
        spotId: kind === "find" ? spotId || undefined : undefined,
      });
      if (await onSave(find, photos)) onClose();
      else
        setError(
          "Salvataggio non riuscito. Le foto restano in bozza: riprova.",
        );
    } catch {
      setError("Controlla i dettagli inseriti e riprova.");
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <Modal
      title={tr(old ? "Modifica il tuo punto" : "Un posto da ricordare")}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit} className="finding-form">
        <fieldset disabled={busy || loading}>
          <div className="kind-toggle">
            <button
              type="button"
              className={kind === "find" ? "selected" : ""}
              onClick={() => setKind("find")}
            >
              {tr("Ritrovamento")}
            </button>
            <button
              type="button"
              className={kind === "spot" ? "selected" : ""}
              onClick={() => setKind("spot")}
            >
              {tr("Fungaia")}
            </button>
          </div>
          <label className="field">
            {tr("Nome del punto")}
            <input
              autoFocus
              required
              maxLength={80}
              value={title}
              placeholder={tr("Es. Porcini sotto il castagno")}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <div className="coordinate-box">
            {draft.coordinate.lat.toFixed(6)}, {draft.coordinate.lng.toFixed(6)}{" "}
            · {draft.source === "gps" ? "GPS" : tr("Mappa")}
          </div>
          <div className="photo-inputs">
            <label className="button secondary">
              {tr("Scatta foto")}
              <input
                aria-label={tr("Scatta foto")}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  void add(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <label className="button secondary">
              {tr("Scegli foto")}
              <input
                aria-label={tr("Scegli foto")}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  void add(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <small>
            {tr("Foto private, solo su questo dispositivo. Massimo 8.")}
          </small>
          <div className="photo-strip">
            {photos.map((photo, i) => (
              <div className="photo-edit" key={photo.id}>
                <PhotoImage photo={photo} />
                <button
                  type="button"
                  aria-pressed={photo.primary}
                  onClick={() =>
                    setPhotos((rows) =>
                      rows.map((row) => ({
                        ...row,
                        primary: row.id === photo.id,
                      })),
                    )
                  }
                >
                  {tr(photo.primary ? "Principale" : "Usa come principale")}
                </button>
                <button
                  type="button"
                  aria-label={`${tr("Elimina foto")} ${i + 1}`}
                  onClick={() =>
                    setPhotos((rows) => {
                      const next = rows.filter((row) => row.id !== photo.id);
                      return next.map((row, n) => ({
                        ...row,
                        primary: photo.primary ? n === 0 : row.primary,
                      }));
                    })
                  }
                >
                  {tr("Elimina foto")}
                </button>
              </div>
            ))}
          </div>
          <details className="finding-extra">
            <summary>{tr("Aggiungi dettagli")}</summary>
            <label className="field">
              {tr("Quantità")}
              <input
                type="number"
                min="0"
                max="1000000"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
            <div className="field-pair">
              <label className="field">
                {tr("Peso")}
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </label>
              <label className="field">
                {tr("Unità peso")}
                <select
                  value={weightUnit}
                  onChange={(e) => {
                    const unit = e.target.value;
                    if (weight !== "") {
                      const kg = grams(Number(weight), weightUnit);
                      setWeight(
                        String(
                          unit === "kg"
                            ? kg
                            : unit === "g"
                              ? kg * 1000
                              : unit === "lb"
                                ? kgToLb(kg)
                                : kgToLb(kg) * 16,
                        ),
                      );
                    }
                    setWeightUnit(unit);
                  }}
                >
                  {(p.weightUnit === "imperial"
                    ? ["oz", "lb"]
                    : ["g", "kg"]
                  ).map((unit) => (
                    <option key={unit}>{unit}</option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset className="habitat-options">
              <legend>{tr("Habitat")}</legend>
              {habitats.map((h) => (
                <label key={h}>
                  <input
                    type="checkbox"
                    checked={environment.includes(h)}
                    onChange={(e) =>
                      setEnvironment((rows) =>
                        e.target.checked
                          ? [...rows, h]
                          : rows.filter((x) => x !== h),
                      )
                    }
                  />
                  {tr(habitatLabels[h])}
                </label>
              ))}
            </fieldset>
            <label className="field">
              {tr("Terreno")}
              <select
                value={soil}
                onChange={(e) => setSoil(e.target.value as typeof soil)}
              >
                <option value="">{tr("Non specificato")}</option>
                {soils.map((s) => (
                  <option key={s} value={s}>
                    {tr(soilLabels[s])}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {tr("Esposizione")}
              <select
                value={aspect}
                onChange={(e) => setAspect(e.target.value as typeof aspect)}
              >
                <option value="">{tr("Sconosciuta")}</option>
                {aspects.map((a) => (
                  <option key={a} value={a}>
                    {tr(`direzione.${a}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {tr("Quota")} ({p.altitudeUnit})
              <input
                type="number"
                step="any"
                value={altitude}
                onChange={(e) => setAltitude(e.target.value)}
              />
            </label>
            {kind === "find" && (
              <label className="field">
                {tr("Fungaia associata")}
                <select
                  value={spotId}
                  onChange={(e) => setSpotId(e.target.value)}
                >
                  <option value="">{tr("Nessuna")}</option>
                  {finds
                    .filter((f) => f.kind === "spot" && f.id !== id)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.title}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label className="field">
              {tr("Le tue note")}
              <textarea
                maxLength={1000}
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </details>
        </fieldset>
        {error && <p role="alert">{tr(error)}</p>}
        {busy && <p role="status">{tr("Elaborazione e salvataggio…")}</p>}
        <button
          className="button primary full"
          type="submit"
          disabled={busy || loading || !title.trim()}
        >
          {tr("Salva punto")}
        </button>
      </form>
    </Modal>
  );
}
