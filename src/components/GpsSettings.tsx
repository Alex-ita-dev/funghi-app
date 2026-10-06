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
  const labels: Record<LocationPermission, string> = {
    granted: "Concesso",
    denied: "Negato",
    prompt: "Da chiedere",
    unknown: "Da verificare",
    unsupported: "Non disponibile",
  };
  return (
    <article className="settings-card">
      <span className="action-icon orange">
        <Crosshair size={23} />
      </span>
      <h2>Posizione e permessi</h2>
      <p>
        Permesso GPS:{" "}
        <strong data-testid="gps-permission">{labels[permission]}</strong>
      </p>
      <button
        className="button primary"
        disabled={pending || permission === "unsupported"}
        onClick={onLocate}
      >
        {pending ? "Ricerca GPS…" : "Attiva posizione"}
      </button>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <ol>
        <li>
          Tocca <strong>Attiva posizione</strong>.
        </li>
        <li>
          Quando il telefono lo chiede, scegli <strong>Consenti</strong> e, se
          presente, <strong>Posizione precisa</strong>.
        </li>
        <li>
          Se il permesso è negato, apri i permessi del sito nel tuo browser e
          consenti la posizione. Controlla anche che la localizzazione del
          telefono sia accesa.
        </li>
        <li>
          Torna qui e premi di nuovo <strong>Attiva posizione</strong>.
        </li>
      </ol>
      <details>
        <summary>Aiuto per iPhone e Android</summary>
        <p>
          <strong>iPhone:</strong> controlla Impostazioni → Privacy e sicurezza
          → Localizzazione e il permesso del browser usato. Nel browser
          controlla anche le impostazioni del sito.
        </p>
        <p>
          <strong>Android:</strong> attiva Posizione nelle impostazioni del
          telefono. Nei permessi dell’app browser e nelle impostazioni del sito
          consenti la posizione.
        </p>
        <p>
          I nomi dei menu possono cambiare. Questa versione web non può aprire
          direttamente tutte le impostazioni del telefono.
        </p>
      </details>
    </article>
  );
}
