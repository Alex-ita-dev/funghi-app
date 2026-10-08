import { usePreferences } from "../hooks/usePreferences";
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
  const { tr, settings } = usePreferences();
  const direction = (degrees: number) =>
    cardinal(degrees, settings.preferences.language);
  return (
    <button
      className="compass-control"
      title={tr("Attiva bussola del dispositivo")}
      aria-label={
        tr("Attiva bussola. {{source}}", { source: tr(source) }) +
        (degrees === null
          ? ""
          : ": " +
            tr("{{degrees}} gradi {{direction}}", {
              degrees: Math.round(degrees),
              direction: direction(degrees),
            }))
      }
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
          ? tr("Nord in alto")
          : `${direction(degrees)} ${Math.round(degrees)}°`}
        <small>{degrees === null ? tr("Attiva bussola") : tr(source)}</small>
      </span>
    </button>
  );
}
