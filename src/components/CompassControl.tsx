import { ArrowUp } from "lucide-react";
import { cardinal } from "../lib/location";
export function CompassControl({
  degrees,
  source,
  onEnable,
}: {
  degrees: number | null;
  source: string;
  onEnable: () => void;
}) {
  return (
    <button
      className="compass-control"
      title="Attiva bussola del dispositivo"
      aria-label={`Attiva bussola. ${source}${degrees === null ? "" : `: ${Math.round(degrees)} gradi ${cardinal(degrees)}`}`}
      onClick={onEnable}
    >
      <span className="compass-dial">
        <b>N</b>
        <ArrowUp
          size={25}
          style={{
            transform: `rotate(${degrees ?? 0}deg)`,
            opacity: degrees === null ? 0.35 : 1,
          }}
        />
      </span>
      <span>
        {degrees === null
          ? "Nord in alto"
          : `${cardinal(degrees)} ${Math.round(degrees)}°`}
        <small>{degrees === null ? "Attiva bussola" : source}</small>
      </span>
    </button>
  );
}
