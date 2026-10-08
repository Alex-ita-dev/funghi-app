import { usePreferences } from "../hooks/usePreferences";
import { Crosshair } from "lucide-react";
import { type LocationPermission } from "../lib/location";
export function GpsSettings({
  permission,
  pending,
  error,
  onLocate,
}: {
  permission: LocationPermission;
  pending: boolean;
  error: string;
  onLocate: () => void;
}) {
  const { tr } = usePreferences();
  const labels: Record<LocationPermission, string> = {
    granted: tr("Concesso"),
    denied: tr("Negato"),
    prompt: tr("Da chiedere"),
    unknown: tr("Da verificare"),
    unsupported: tr("Non disponibile"),
  };
  return (
    <article className="settings-card">
      <span className="action-icon orange">
        <Crosshair size={23} />
      </span>
      <h2>{tr("Posizione e permessi")}</h2>
      <p>
        {" "}
        {tr("Permesso GPS:")}{" "}
        <strong data-testid="gps-permission">{labels[permission]}</strong>
      </p>
      <button
        className="button primary"
        disabled={pending || permission === "unsupported"}
        onClick={onLocate}
      >
        {pending ? tr("Ricerca GPS…") : tr("Attiva posizione")}
      </button>
      {error && (
        <p className="inline-error" role="alert">
          {tr(error)}
        </p>
      )}
      <ol>
        <li>
          {" "}
          {tr("Tocca")} <strong>{tr("Attiva posizione")}</strong>.
        </li>
        <li>
          {" "}
          {tr("Quando il telefono lo chiede, scegli")}{" "}
          <strong>{tr("Consenti")}</strong> {tr("e, se presente,")}{" "}
          <strong>{tr("Posizione precisa")}</strong>.
        </li>
        <li>
          {" "}
          {tr(
            "Se il permesso è negato, apri i permessi del sito nel tuo browser e consenti la posizione. Controlla anche che la localizzazione del telefono sia accesa.",
          )}{" "}
        </li>
        <li>
          {" "}
          {tr("Torna qui e premi di nuovo")}{" "}
          <strong>{tr("Attiva posizione")}</strong>.
        </li>
      </ol>
      <details>
        <summary>{tr("Aiuto per iPhone e Android")}</summary>
        <p>
          <strong>iPhone:</strong>{" "}
          {tr(
            "controlla Impostazioni → Privacy e sicurezza → Localizzazione e il permesso del browser usato. Nel browser controlla anche le impostazioni del sito.",
          )}{" "}
        </p>
        <p>
          <strong>Android:</strong>{" "}
          {tr(
            "attiva Posizione nelle impostazioni del telefono. Nei permessi dell’app browser e nelle impostazioni del sito consenti la posizione.",
          )}{" "}
        </p>
        <p>
          {" "}
          {tr(
            "I nomi dei menu possono cambiare. Questa versione web non può aprire direttamente tutte le impostazioni del telefono.",
          )}{" "}
        </p>
      </details>
    </article>
  );
}
