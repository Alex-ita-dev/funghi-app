import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { usePreferences } from "../hooks/usePreferences";
import { aspectDirection } from "../lib/mycoTerrain";
import { ecologyProfiles, type EcologyProfileId } from "../lib/ecologyModel";
import { loadEcology, type EcologyAnalysis } from "../services/mycoEcology";
import type { CellSample } from "../services/mycoAnalysis";
import { formatTemperature, formatPrecipitation } from "../lib/units";
import type { Coordinate } from "../lib/model";
export function MycoScoreCard({
  point,
  onClose,
  sample,
  initialProfile = "generic",
}: {
  point: Coordinate;
  onClose: () => void;
  sample?: CellSample | null;
  initialProfile?: EcologyProfileId;
}) {
  const { tr, settings, altitude, dateTime, dateLabel } = usePreferences(),
    p = settings.preferences;
  const [profile, setProfile] = useState<EcologyProfileId>(
    sample?.profile ?? initialProfile,
  );
  const [analysis, setAnalysis] = useState<EcologyAnalysis | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setAnalysis(null);
    setError("");
    void loadEcology(point, profile, controller.signal, attempt ? null : sample)
      .then((value) => {
        if (!controller.signal.aborted) setAnalysis(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("myco.error");
      });
    return () => controller.abort();
  }, [point.lat, point.lng, profile, sample, attempt]);
  const n = (v: number, digits = 1) =>
    new Intl.NumberFormat(p.language, { maximumFractionDigits: digits }).format(
      v,
    );
  const temperature = (v: number) => formatTemperature(v, p),
    rain = (v: number) => formatPrecipitation(v, p);
  const delta = (v: number) =>
    `${v > 0 ? "+" : ""}${n(p.temperatureUnit === "F" ? v * 1.8 : v)} °${p.temperatureUnit}`;
  const field = (
    label: string,
    value: number | null | undefined,
    format: (v: number) => string = n,
  ) => (
    <div key={label}>
      <dt>{tr(label, label === "eco.wetDays" ? { value: rain(1) } : {})}</dt>
      <dd>
        {value === null || value === undefined
          ? tr("myco.unavailable")
          : format(value)}
      </dd>
    </div>
  );
  const textField = (label: string, value: string) => (
    <div key={label}>
      <dt>{tr(label, label === "eco.wetDays" ? { value: rain(1) } : {})}</dt>
      <dd>{value}</dd>
    </div>
  );
  const r = analysis?.result,
    m = r?.metrics,
    terrain = analysis?.terrain;
  const retry = (
    <button
      className="button secondary"
      onClick={() => setAttempt((x) => x + 1)}
    >
      {tr("myco.retry")}
    </button>
  );
  return (
    <Modal title={tr("myco.title")} onClose={onClose}>
      <section className="myco-card">
        <p>{tr("myco.subtitle")}</p>
        <label className="field">
          {tr("myco.profile")}
          <select
            value={profile}
            onChange={(e) => setProfile(e.target.value as EcologyProfileId)}
          >
            {Object.keys(ecologyProfiles).map((id) => (
              <option key={id} value={id}>
                {tr(`myco.${id}`)}
              </option>
            ))}
          </select>
        </label>
        {!analysis && !error && <p role="status">{tr("eco.loading")}</p>}
        {error && (
          <div role="alert">
            <p>{tr(error)}</p>
            {retry}
          </div>
        )}
        {analysis && r && terrain && (
          <>
            <div className="myco-result" role="status">
              {r.status === "scored" ? (
                <>
                  <strong data-testid="myco-score">
                    {n(r.score!, 0)}
                    <small> / 100</small>
                  </strong>
                  <p>{tr(`myco.class.${r.classification}`)}</p>
                </>
              ) : (
                <>
                  <h3 data-testid="myco-status">{tr(`eco.${r.status}`)}</h3>
                  <p>
                    {tr(
                      r.status === "unsuitable"
                        ? "eco.exclusion"
                        : r.status === "uncertain"
                          ? "eco.unknownNote"
                          : "eco.partial",
                      { surface: tr(`eco.cover.${analysis.land.category}`) },
                    )}
                  </p>
                </>
              )}
            </div>
            <p>
              {tr("myco.reliability")}:{" "}
              <strong>{tr(`myco.${r.confidenceLabel}`)}</strong>
            </p>
            <small>{tr("eco.confidenceNote")}</small>
            <p>
              {tr(analysis.cached ? "myco.cached" : "myco.updated")}:{" "}
              {dateTime(
                analysis.environment?.fetchedAt ?? analysis.land.fetchedAt,
              )}
            </p>
            {analysis.stale && <p role="status">{tr("myco.stale")}</p>}
            {(r.status === "uncertain" || r.status === "insufficient") && (
              <div role="alert">
                <p>{tr(!navigator.onLine ? "myco.offline" : "eco.partial")}</p>
                {retry}
              </div>
            )}
            {r.status !== "unsuitable" && (
              <>
                <h3>{tr("myco.why")}</h3>
                <ul className="myco-reasons">
                  {r.reasons.map((f) => (
                    <li key={f.id}>
                      {f.score! >= 65 ? "+ " : f.score! < 45 ? "− " : "≈ "}
                      {tr(`eco.factor.${f.id}`)}:{" "}
                      {tr(
                        f.score! >= 65
                          ? "myco.compatible"
                          : f.score! < 45
                            ? "myco.unfavourable"
                            : "myco.mixed",
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <details className="ecology-details">
              <summary>{tr("eco.details")}</summary>
              <dl className="myco-facts">
                {textField(
                  "eco.surface",
                  tr(`eco.cover.${analysis.land.category}`),
                )}
                {textField("eco.habitat", tr(`eco.compat.${r.habitat.status}`))}
                {textField(
                  "eco.host",
                  tr(
                    r.habitat.hostCompatibility === "notRequired"
                      ? "eco.notRequired"
                      : "myco.unavailable",
                  ),
                )}
                {textField(
                  "eco.geography",
                  tr(`eco.compat.${r.biogeography.status}`),
                )}
                {textField(
                  "eco.climate",
                  tr(`eco.climate.${r.biogeography.climateBand}`),
                )}
                {field("eco.latitude", point.lat, (v) => `${n(v, 4)}°`)}
                {field("eco.longitude", point.lng, (v) => `${n(v, 4)}°`)}
                {field("eco.landYear", analysis.land.year, (v) => String(v))}
                {field(
                  "eco.landResolution",
                  analysis.land.resolutionM,
                  altitude,
                )}
                {field("eco.conditions", r.conditions, (v) => `${n(v, 0)}/100`)}
                {field("eco.confidence", r.confidence, (v) => `${n(v, 0)}/100`)}
              </dl>
              <p>{tr("eco.geographyNote")}</p>
              {analysis.environment && (
                <small>
                  {tr("myco.period", {
                    from: dateLabel(
                      Date.parse(
                        analysis.environment.days[0].date + "T12:00:00Z",
                      ),
                    ),
                    to: dateLabel(
                      Date.parse(
                        analysis.environment.days[29].date + "T12:00:00Z",
                      ),
                    ),
                  })}
                </small>
              )}
              <h3>{tr("myco.rain")}</h3>
              <dl className="myco-facts">
                {field("myco.rain7", m?.rain7, rain)}
                {field("myco.rain14", m?.rain14, rain)}
                {field("myco.rain21", m?.rain21, rain)}
                {field("myco.rain30", m?.rain30, rain)}
                {field("myco.lastRain", m?.postRain, (v) =>
                  tr(v >= 30 ? "myco.daysAtLeast" : "myco.daysAgo", {
                    n: n(v, 0),
                  }),
                )}
                {field("eco.wetDays", r.rain.wetDays, (v) => n(v, 0))}
                {field(
                  "eco.peakRain",
                  r.rain.peakShare,
                  (v) => `${n(v * 100, 0)}%`,
                )}
              </dl>
              <small>{tr("myco.rainThreshold", { value: rain(5) })}</small>
              <h3>{tr("myco.soil")}</h3>
              <dl className="myco-facts">
                {field("myco.moisture", m?.moisture, (v) => `${n(v, 3)} m³/m³`)}
                {field("myco.soilTemp", m?.soil, temperature)}
                {field("eco.soilTrend", r.temporal.soilTrend, delta)}
                {field("myco.et0", m?.et0, rain)}
                {field("myco.drying", m?.drying, rain)}
                {field("eco.vpd", r.vpd, (v) => `${n(v, 2)} kPa`)}
                {field("eco.ph", analysis.soil?.ph)}
                {field(
                  "eco.sand",
                  analysis.soil?.sandPercent,
                  (v) => `${n(v)}%`,
                )}
                {field(
                  "eco.clay",
                  analysis.soil?.clayPercent,
                  (v) => `${n(v)}%`,
                )}
                {field(
                  "eco.silt",
                  analysis.soil?.siltPercent,
                  (v) => `${n(v)}%`,
                )}
                {field(
                  "eco.carbon",
                  analysis.soil?.organicCarbon,
                  (v) => `${n(v)} g/kg`,
                )}
              </dl>
              {!analysis.soil && <small>{tr("eco.soilUnavailable")}</small>}
              <h3>{tr("myco.air")}</h3>
              <dl className="myco-facts">
                {field("myco.airMean", m?.air, temperature)}
                {field("myco.min", m?.min, temperature)}
                {field("myco.max", m?.max, temperature)}
                {field("myco.trend", m?.trend, delta)}
                {field("myco.humidity", m?.humidity, (v) => `${n(v)}%`)}
                {field(
                  "eco.wind",
                  r.wind,
                  (v) =>
                    `${n(p.distanceUnit === "imperial" ? v / 1.609344 : v)} ${p.distanceUnit === "imperial" ? "mph" : "km/h"}`,
                )}
                {field("eco.radiation", r.radiation, (v) => `${n(v)} MJ/m²`)}
              </dl>
              <h3>{tr("myco.terrain")}</h3>
              <dl className="myco-facts">
                {field(
                  "myco.altitude",
                  terrain.elevationM ?? analysis.environment?.elevationM,
                  altitude,
                )}
                {field("myco.aspect", terrain.aspectDegrees, (v) =>
                  tr(`direzione.${aspectDirection(v)}`),
                )}
                {field("myco.slope", terrain.slopeDegrees, (v) => `${n(v)}°`)}
                {field(
                  "eco.elevationFit",
                  r.temporal.elevation,
                  (v) => `${n(v, 0)}/100`,
                )}
                {field(
                  "eco.seasonFit",
                  r.temporal.season,
                  (v) => `${n(v, 0)}/100`,
                )}
              </dl>
              {terrain.slopeDegrees !== null && terrain.slopeDegrees < 2 && (
                <small>{tr("heat.flat")}</small>
              )}
              <p>{tr("eco.terrainNote")}</p>
              <dl className="myco-facts">
                {r.factors.map((f) => (
                  <div key={f.id}>
                    <dt>
                      {tr(`eco.factor.${f.id}`)} ({n(f.weight, 0)}%)
                    </dt>
                    <dd>
                      {f.score === null
                        ? tr("myco.unavailable")
                        : `${n(f.score, 0)}/100`}
                    </dd>
                  </div>
                ))}
              </dl>
              <p>{tr("eco.formula")}</p>
              <small>{r.algorithmVersion}</small>
            </details>
          </>
        )}
        <p className="myco-note">{tr("myco.disclaimer")}</p>
        <small>{tr("eco.privacy")}</small>
        <p className="ecology-sources">
          <a
            href="https://livingatlas.arcgis.com/landcover/"
            target="_blank"
            rel="noreferrer"
          >
            Impact Observatory / Microsoft / Esri
          </a>{" "}
          ·{" "}
          <a
            href="https://www.marineregions.org/"
            target="_blank"
            rel="noreferrer"
          >
            Marine Regions (VLIZ)
          </a>{" "}
          ·{" "}
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
            Open-Meteo / Copernicus DEM
          </a>{" "}
          ·{" "}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noreferrer"
          >
            CC BY 4.0
          </a>
        </p>
      </section>
    </Modal>
  );
}
