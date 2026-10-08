import { usePreferences } from "../hooks/usePreferences";
import { useState } from "react";
import { Copy, Crosshair, Phone, Share2 } from "lucide-react";
import { Modal } from "./Modal";
import { type LiveFix, coordinateText, isRecent } from "../lib/location";
export function SosPanel({
  fix,
  now,
  pending,
  error,
  onLocate,
  onClose,
}: {
  fix: LiveFix | null;
  now: number;
  pending: boolean;
  error: string;
  onLocate: () => void;
  onClose: () => void;
}) {
  const { tr, settings, metres, altitude, dateTime } = usePreferences();
  const [status, setStatus] = useState("");
  async function copy() {
    if (!fix) return;
    try {
      await navigator.clipboard.writeText(
        coordinateText(fix, now, settings.preferences),
      );
      setStatus(tr("Coordinate copiate."));
    } catch {
      setStatus(
        tr(
          "Copia automatica non disponibile. Tieni premuto il testo delle coordinate per copiarlo.",
        ),
      );
    }
  }
  async function share() {
    if (!fix) return;
    try {
      if (!navigator.share) {
        await copy();
        return;
      }
      await navigator.share({
        title: tr("Posizione MycoTrail"),
        text: coordinateText(fix, now, settings.preferences),
      });
      setStatus(
        tr(
          "Posizione consegnata al sistema di condivisione; verifica l’invio nell’app scelta.",
        ),
      );
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setStatus(tr("Condivisione non riuscita. Puoi copiare le coordinate."));
    }
  }
  return (
    <Modal title={tr("SOS · La tua posizione")} onClose={onClose}>
      <a className="button danger full emergency-call" href="tel:112">
        <Phone size={20} /> {tr("Chiama 112")}{" "}
      </a>
      <p className="modal-description">
        {" "}
        {tr(
          "Apre il telefono: MycoTrail non invia automaticamente richieste di soccorso. Comunica le coordinate all’operatore. La chiamata dipende dalla copertura telefonica.",
        )}{" "}
      </p>
      {fix ? (
        <>
          <p
            className={`sos-fix-status ${!isRecent(fix, now) || fix.accuracy > 50 ? "warning" : ""}`}
          >
            {!isRecent(fix, now)
              ? tr("Posizione precedente: potrebbe non essere dove sei ora.")
              : fix.accuracy > 50
                ? tr("Posizione recente ma imprecisa.")
                : tr("Posizione GPS recente")}
          </p>
          <dl className="sos-coordinates">
            <dt>{tr("Latitudine")}</dt>
            <dd>{fix.lat.toFixed(6)}</dd>
            <dt>{tr("Longitudine")}</dt>
            <dd>{fix.lng.toFixed(6)}</dd>
            <dt>{tr("Precisione")}</dt>
            <dd>±{metres(fix.accuracy)}</dd>
            <dt>{tr("Quota GPS")}</dt>
            <dd>
              {fix.altitude === null
                ? tr("Non disponibile")
                : altitude(fix.altitude)}
              {fix.altitudeAccuracy !== null &&
                ` (±${altitude(fix.altitudeAccuracy)})`}
            </dd>
            <dt>{tr("Rilevata alle")}</dt>
            <dd>{dateTime(fix.timestamp)}</dd>
          </dl>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => void copy()}>
              <Copy size={18} /> {tr("Copia coordinate")}{" "}
            </button>
            <button className="button secondary" onClick={() => void share()}>
              <Share2 size={18} /> {tr("Condividi coordinate")}{" "}
            </button>
          </div>
        </>
      ) : (
        <p className="info-note">
          {" "}
          {tr(
            "Nessuna posizione rilevata. Puoi chiamare il 112 anche senza attendere il GPS.",
          )}{" "}
        </p>
      )}
      <button
        className="button primary full"
        disabled={pending}
        onClick={onLocate}
      >
        <Crosshair size={18} />
        {pending ? tr("Ricerca posizione…") : tr("Aggiorna posizione GPS")}
      </button>
      {error && (
        <p role="alert" className="inline-error">
          {tr(error)}
        </p>
      )}
      {status && (
        <p role="status" className="info-note">
          {status}
        </p>
      )}
      <p className="modal-description">
        {" "}
        {tr(
          "Coordinate disponibili anche senza internet se il GPS riesce a rilevarle. Condivisione e consegna del messaggio dipendono dall’app scelta e dalla rete.",
        )}{" "}
      </p>
    </Modal>
  );
}
