import { useEffect, useRef, useState } from "react";
import { usePreferences } from "../hooks/usePreferences";
import { createGrid, scoreColors, type Viewport } from "../lib/mycoArea";
import type { EcologyProfileId as Profile } from "../lib/ecologyModel";
import {
  analyzeArea,
  cachedArea,
  type AreaAnalysis,
} from "../services/mycoAnalysis";
export function MycoAreaControls({
  viewport,
  profile,
  onProfile,
  area,
  onArea,
  shown,
  onShown,
  opacity,
  onOpacity,
  onCell,
}: {
  viewport: Viewport | null;
  profile: Profile;
  onProfile: (p: Profile) => void;
  area: AreaAnalysis | null;
  onArea: (a: AreaAnalysis) => void;
  shown: boolean;
  onShown: (s: boolean) => void;
  opacity: number;
  onOpacity: (v: number) => void;
  onCell: (i: number) => void;
}) {
  const { tr, dateTime } = usePreferences();
  const [busy, setBusy] = useState(false),
    [done, setDone] = useState(0),
    [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const grid = viewport ? createGrid(viewport) : null;
  useEffect(() => () => controller.current?.abort(), []);
  function cancel() {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setError("");
  }
  function toggle() {
    if (shown) cancel();
    else if (grid && !area && profile !== "chanterelles") {
      const cached = cachedArea(grid, profile);
      if (cached) onArea(cached);
    }
    onShown(!shown);
  }
  async function analyze() {
    if (!grid || profile === "chanterelles") return;
    cancel();
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setDone(0);
    setTotal(grid.cells.length);
    try {
      const result = await analyzeArea(grid, profile, current.signal, setDone);
      if (!current.signal.aborted) onArea(result);
    } catch (e) {
      if (!current.signal.aborted)
        setError(
          e instanceof Error && e.message === "heat.offline"
            ? "heat.offline"
            : "myco.error",
        );
    } finally {
      if (controller.current === current) {
        controller.current = null;
        setBusy(false);
      }
    }
  }
  const moved =
    area && (area.grid.key !== grid?.key || area.profile !== profile);
  return (
    <section className="myco-area" aria-label={tr("heat.title")}>
      <div className="heat-actions">
        <label>
          {tr("myco.profile")}
          <select
            value={profile}
            disabled={busy}
            onChange={(e) => {
              const next = e.target.value as Profile;
              onProfile(next);
              if (next === "chanterelles") onShown(false);
            }}
          >
            <option value="generic">{tr("myco.generic")}</option>
            <option value="porcini">{tr("myco.porcini")}</option>
            <option value="chanterelles">{tr("myco.chanterelles")}</option>
          </select>
        </label>
        <button
          className="button secondary"
          aria-pressed={shown}
          disabled={profile === "chanterelles"}
          onClick={toggle}
        >
          {tr("heat.title")}
        </button>
      </div>
      <small>{tr("eco.legacyMap")}</small>
      {shown && (
        <>
          <div className="heat-actions">
            <button
              className="button primary"
              disabled={!grid || busy}
              onClick={() => void analyze()}
            >
              {tr(area ? "heat.refresh" : "heat.analyze")}
            </button>
            {busy ? (
              <button className="button secondary" onClick={cancel}>
                {tr("heat.cancel")}
              </button>
            ) : (
              <small>
                {tr(
                  grid ? "heat.area" : "heat.zoom",
                  grid
                    ? {
                        km: String(grid.widthM / 1000),
                        n: String(grid.cells.length),
                      }
                    : {},
                )}
              </small>
            )}
          </div>
          {busy && (
            <div role="status">
              <span>
                {tr("heat.progress", {
                  n: String(done),
                  total: String(total),
                })}
              </span>
              <progress value={done} max={total} />
            </div>
          )}
          {error && <p role="alert">{tr(error)}</p>}
          {moved && <small role="status">{tr("heat.moved")}</small>}
          {area && (
            <>
              <p className="heat-stamp">
                {tr(`myco.${area.profile}`)} ·{" "}
                {tr(area.cached ? "myco.cached" : "myco.updated")}:{" "}
                {dateTime(area.updatedAt)}
              </p>
              {area.environments.some((e) => e?.stale) && (
                <small>{tr("myco.stale")}</small>
              )}
              {area.cells.some(
                (c) => c.score === null || c.terrain.slopeDegrees === null,
              ) && <small role="status">{tr("heat.partial")}</small>}
              <details>
                <summary>{tr("heat.legend")}</summary>
                <div className="heat-legend">
                  {["poor", "low", "fair", "good", "veryGood"].map((key, i) => (
                    <span key={key}>
                      <i style={{ background: scoreColors[i] }} />
                      {["0–24", "25–44", "45–64", "65–79", "80–100"][i]}{" "}
                      {tr(`myco.class.${key}`)}
                    </span>
                  ))}
                </div>
                <label>
                  {tr("heat.opacity")}{" "}
                  <input
                    type="range"
                    min="0.15"
                    max="0.65"
                    step="0.05"
                    value={opacity}
                    onChange={(e) => onOpacity(Number(e.target.value))}
                  />
                </label>
                <p>{tr("heat.resolution")}</p>
                <details>
                  <summary>{tr("heat.cells")}</summary>
                  <div className="heat-cells">
                    {area.cells.map((c, i) => (
                      <button
                        className="button secondary"
                        key={c.id}
                        disabled={c.score === null}
                        onClick={() => onCell(i)}
                      >
                        {i + 1}: {c.score ?? "—"}/100
                      </button>
                    ))}
                  </div>
                </details>
              </details>
              <div className="heat-scale" aria-label={tr("heat.legend")}>
                {scoreColors.map((color, i) => (
                  <span key={color} style={{ borderColor: color }}>
                    {[0, 25, 50, 75, 100][i]}
                  </span>
                ))}
              </div>
            </>
          )}
          <small>
            {tr("eco.legacyMap")} · {tr("heat.privacy")}
          </small>
        </>
      )}
    </section>
  );
}
