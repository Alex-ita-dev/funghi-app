import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { usePreferences } from "../hooks/usePreferences";
import { type speciesProfiles } from "../lib/mycoScore";
import { computeMycoScoreV2, type Profile } from "../lib/mycoScoreV2";
import {
  aspectDirection,
  emptyTerrain,
  type Terrain,
} from "../lib/mycoTerrain";
import { loadTerrains } from "../services/mycoTerrain";
import type { CellSample } from "../services/mycoAnalysis";
import { loadEnvironment } from "../services/mycoEnvironment";
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
  initialProfile?: Profile;
}) {
  const { tr, settings, altitude, dateTime, dateLabel } = usePreferences();
  const p = settings.preferences;
  const [profile, setProfile] = useState<keyof typeof speciesProfiles>(
    sample?.profile ?? initialProfile,
  );
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof loadEnvironment>
  > | null>(null);
  const [terrain, setTerrain] = useState<Terrain>(
    sample?.terrain ?? emptyTerrain,
  );
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setTerrain(emptyTerrain);
    setError("");
    if (sample) {
      setResult(sample.environment);
      setTerrain(sample.terrain);
      setProfile(sample.profile);
      return () => controller.abort();
    }
    void loadTerrains([point], controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) setTerrain(rows[0]);
      })
      .catch(() => {});
    void loadEnvironment(point, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setResult(value);
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted)
          setError(e.message.startsWith("myco.") ? e.message : "myco.error");
      });
    return () => controller.abort();
  }, [point.lat, point.lng, attempt, sample]);
  const computed = result
    ? computeMycoScoreV2(
        { ...result.data, ...point },
        terrain,
        profile,
        sample?.analysisDate,
      )
    : null;
  const n = (v: number, digits = 1) =>
    new Intl.NumberFormat(p.language, { maximumFractionDigits: digits }).format(
      v,
    );
  const temperature = (v: number) => formatTemperature(v, p);
  const rain = (v: number) => formatPrecipitation(v, p);
  const field = (
    label: string,
    value: number | null,
    format: (n: number) => string = n,
  ) => (
    <div key={label}>
      <dt>{tr(label)}</dt>
      <dd>{value === null ? tr("myco.unavailable") : format(value)}</dd>
    </div>
  );
  return (
    <Modal title={tr("myco.title")} onClose={onClose}>
      <section className="myco-card">
        <p>{tr("myco.subtitle")}</p>
        <small>
          {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
        </small>
        <label className="field">
          {tr("myco.profile")}
          <select
            value={profile}
            onChange={(e) => setProfile(e.target.value as typeof profile)}
          >
            <option value="generic">{tr("myco.generic")}</option>
            <option value="porcini">{tr("myco.porcini")}</option>
          </select>
        </label>
        {!result && !error && <p role="status">{tr("myco.loading")}</p>}
        {error && (
          <div role="alert">
            <p>{tr(error)}</p>
            <button
              className="button secondary"
              onClick={() => setAttempt((x) => x + 1)}
            >
              {tr("myco.retry")}
            </button>
          </div>
        )}
        {result && computed && (
          <>
            <div className="myco-result" role="status">
              <strong data-testid="myco-score">
                {computed.score === null ? "—" : n(computed.score, 0)}
                <small> / 100</small>
              </strong>
              <p>
                {tr(
                  computed.classification
                    ? `myco.class.${computed.classification}`
                    : "myco.missing",
                )}
              </p>
            </div>
            <p>
              {tr("myco.reliability")}:{" "}
              <strong>
                {tr(`myco.${result.stale ? "low" : computed.reliability}`)}
              </strong>{" "}
              · {n(computed.coverage, 0)}% {tr("myco.coverage")}
            </p>
            <small>{tr("myco.reliabilityNote")}</small>
            <p>
              {tr(result.cached ? "myco.cached" : "myco.updated")}:{" "}
              {dateTime(result.data.fetchedAt)}
            </p>
            {result.stale && <p role="status">{tr("myco.stale")}</p>}
            <small>
              {tr("myco.period", {
                from: dateLabel(
                  Date.parse(result.data.days[0].date + "T12:00:00Z"),
                ),
                to: dateLabel(
                  Date.parse(result.data.days[29].date + "T12:00:00Z"),
                ),
              })}
            </small>
            <h3>{tr("myco.why")}</h3>
            <ul className="myco-reasons">
              {computed.explanations.map((f) => (
                <li key={f.id}>
                  {f.score! >= 65 ? "+ " : f.score! < 45 ? "− " : "≈ "}
                  {tr(`myco.factor.${f.id}`)}:{" "}
                  {tr(
                    f.score! >= 65
                      ? "myco.compatible"
                      : f.score! < 45
                        ? "myco.unfavourable"
                        : "myco.mixed",
                  )}{" "}
                  ({n(f.score!, 0)}/100)
                </li>
              ))}
            </ul>
            <h3>{tr("myco.rain")}</h3>
            <dl className="myco-facts">
              {field("myco.rain7", computed.metrics.rain7, rain)}
              {field("myco.rain14", computed.metrics.rain14, rain)}
              {field("myco.rain21", computed.metrics.rain21, rain)}
              {field("myco.rain30", computed.metrics.rain30, rain)}
              {field("myco.lastRain", computed.metrics.postRain, (v) =>
                tr(v >= 30 ? "myco.daysAtLeast" : "myco.daysAgo", {
                  n: n(v, 0),
                }),
              )}
            </dl>
            <small>{tr("myco.rainThreshold", { value: rain(5) })}</small>
            <h3>{tr("myco.soil")}</h3>
            <dl className="myco-facts">
              {field(
                "myco.moisture",
                computed.metrics.moisture,
                (v) => `${n(v, 3)} m³/m³`,
              )}
              {field("myco.soilTemp", computed.metrics.soil, temperature)}
              {field("myco.et0", computed.metrics.et0, rain)}
              {field("myco.drying", computed.metrics.drying, rain)}
            </dl>
            <h3>{tr("myco.air")}</h3>
            <dl className="myco-facts">
              {field("myco.airMean", computed.metrics.air, temperature)}
              {field("myco.min", computed.metrics.min, temperature)}
              {field("myco.max", computed.metrics.max, temperature)}
              {field(
                "myco.trend",
                computed.metrics.trend,
                (v) =>
                  `${v > 0 ? "+" : ""}${n(p.temperatureUnit === "F" ? v * 1.8 : v)} °${p.temperatureUnit}`,
              )}
              {field(
                "myco.humidity",
                computed.metrics.humidity,
                (v) => `${n(v)}%`,
              )}
            </dl>
            <h3>{tr("myco.terrain")}</h3>
            <dl className="myco-facts">
              {field(
                "myco.altitude",
                terrain.elevationM ?? result.data.elevationM,
                altitude,
              )}
              {field("myco.aspect", terrain.aspectDegrees, (v) =>
                tr(`direzione.${aspectDirection(v)}`),
              )}
              {field("myco.slope", terrain.slopeDegrees, (v) => `${n(v)}°`)}
            </dl>
            {terrain.slopeDegrees !== null && terrain.slopeDegrees < 2 && (
              <small>{tr("heat.flat")}</small>
            )}
            <small>{tr("heat.resolution")}</small>
            <details>
              <summary>{tr("myco.factors")}</summary>
              <dl className="myco-facts">
                {computed.factors.map((f) => (
                  <div key={f.id}>
                    <dt>
                      {tr(`myco.factor.${f.id}`)} ({n(f.weight, 2)}%)
                    </dt>
                    <dd>
                      {f.score === null
                        ? tr("myco.unavailable")
                        : `${n(f.score, 0)}/100`}
                    </dd>
                  </div>
                ))}
              </dl>
              <p>{tr("heat.formula")}</p>
            </details>
          </>
        )}
        <p className="myco-note">{tr("myco.disclaimer")}</p>
        <small>{tr("myco.privacy")}</small>
        <p>
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
            {tr("myco.source")} / Copernicus DEM
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
