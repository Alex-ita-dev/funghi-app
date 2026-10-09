import { usePreferences } from "../hooks/usePreferences";
import type { Find } from "../lib/model";
import type { PhotoMeta } from "../lib/photos";
import { FindingPhotos } from "./FindingPhotos";
import { spotHistory, habitatLabels, soilLabels } from "../lib/findings";
import { formatWeight } from "../lib/units";
export function FindingSummary({ find }: { find: Find }) {
  const { tr, settings } = usePreferences();
  return (
    <span>
      {find.quantity !== undefined ? `${find.quantity} · ` : ""}
      {find.weightKg !== undefined
        ? formatWeight(find.weightKg, settings.preferences)
        : tr("Nessun peso registrato")}
    </span>
  );
}
export function FindingDetails({
  find,
  finds,
  photos,
  onOpen,
  onAdd,
}: {
  find: Find;
  finds: Find[];
  photos: PhotoMeta[];
  onOpen: (f: Find) => void;
  onAdd: () => void;
}) {
  const { tr, dateTime, altitude, settings } = usePreferences();
  const history = spotHistory(finds, find.id);
  const parent = finds.find((f) => f.id === find.spotId);
  return (
    <>
      <FindingPhotos photos={photos} />
      <p>
        <FindingSummary find={find} />
      </p>
      <dl className="finding-facts">
        <dt>{tr("Data e ora")}</dt>
        <dd>{dateTime(find.createdAt)}</dd>
        {find.altitudeM !== undefined && (
          <>
            <dt>{tr("Quota")}</dt>
            <dd>{altitude(find.altitudeM)}</dd>
          </>
        )}
        {!!find.habitats?.length && (
          <>
            <dt>{tr("Habitat")}</dt>
            <dd>{find.habitats.map((h) => tr(habitatLabels[h])).join(", ")}</dd>
          </>
        )}
        {find.soil && (
          <>
            <dt>{tr("Terreno")}</dt>
            <dd>{tr(soilLabels[find.soil])}</dd>
          </>
        )}
        {find.aspect && (
          <>
            <dt>{tr("Esposizione")}</dt>
            <dd>{tr(`direzione.${find.aspect}`)}</dd>
          </>
        )}
      </dl>
      {parent && (
        <button className="text-button" onClick={() => onOpen(parent)}>
          {tr("Fungaia associata")}: {parent.title}
        </button>
      )}
      {find.kind === "spot" && (
        <section className="spot-history">
          <h3>{tr("Storico fungaia")}</h3>
          <p>
            {tr("Totale ritrovamenti")}: {history.count}
            {history.hasWeight && (
              <>
                {" "}
                · {tr("Peso totale")}:{" "}
                {formatWeight(history.weightKg, settings.preferences)}
              </>
            )}
          </p>
          {history.last !== undefined && (
            <p>
              {tr("Ultimo ritrovamento")}: {dateTime(history.last)}
            </p>
          )}
          <button className="button secondary" onClick={onAdd}>
            {tr("Aggiungi ritrovamento qui")}
          </button>
          <ol>
            {history.entries.map((f) => (
              <li key={f.id}>
                <button className="history-entry" onClick={() => onOpen(f)}>
                  <time>{dateTime(f.createdAt)}</time>
                  <strong>{f.title}</strong>
                  <FindingSummary find={f} />
                </button>
              </li>
            ))}
          </ol>
          {!history.count && <p>{tr("Nessun ritrovamento associato.")}</p>}
        </section>
      )}
    </>
  );
}
