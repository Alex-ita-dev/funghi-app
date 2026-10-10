import { useEffect, useRef, useState } from "react";
import { usePreferences } from "../hooks/usePreferences";
import { createGrid, scoreColors, type Viewport } from "../lib/mycoArea";
import type { EcologyProfileId as Profile } from "../lib/ecologyModel";
import {
  analyzeArea,
  cachedArea,
  changeAreaSpecies,
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
  onClear,
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
  onClear: () => void;
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
    else if (grid && !area) {
      const cached = cachedArea(grid, profile);
      if (cached) onArea(cached);
    }
    onShown(!shown);
  }
  async function analyze() {
    if (!grid) return;
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
              if (area) onArea(changeAreaSpecies(area, next));
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
          onClick={toggle}
        >
          {tr(shown ? "heat.hide" : "heat.title")}
        </button>
      </div>
      <strong>
        {tr("heat.mapTitle")} — {tr(`myco.${profile}`)}
      </strong>
      {shown && (
        <>
          <div className="heat-actions">
            <button
              className="button primary"
              disabled={!grid || busy}
              onClick={() => void analyze()}
            >
              {tr(
                moved ? "heat.newArea" : area ? "heat.refresh" : "heat.analyze",
              )}
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
                        km: String((grid.widthM / 1000) ** 2),
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
              <small>
                {tr("heat.analysis")}: {dateTime(Date.parse(area.analysisDate))}
              </small>
              <p className="heat-stamp">
                {tr(`myco.${area.profile}`)} ·{" "}
                {tr(area.cached ? "myco.cached" : "myco.updated")}:{" "}
                {dateTime(area.updatedAt)} ·{" "}
                {tr("heat.age", {
                  min: String(
                    Math.max(
                      0,
                      Math.floor((Date.now() - area.updatedAt) / 60000),
                    ),
                  ),
                })}
              </p>
              {area.environments.some((e) => e?.stale) && (
                <small>{tr("myco.stale")}</small>
              )}
              {area.cells.some((c) => c.status === "insufficientData") && (
                <small role="status">{tr("heat.partial")}</small>
              )}
              {area.cells.filter((c) => c.status === "insufficientData")
                .length >
                area.cells.length / 2 && (
                <p role="alert">{tr("heat.quality")}</p>
              )}
              <button
                className="button secondary"
                disabled={busy}
                onClick={onClear}
              >
                {tr("heat.clear")}
              </button>
              <details open>
                <summary>{tr("heat.legend")}</summary>
                <div className="heat-legend">
                  {["poor", "low", "fair", "good", "veryGood"].map((key, i) => (
                    <span key={key}>
                      <i style={{ background: scoreColors[i] }} />
                      {["0–24", "25–44", "45–64", "65–79", "80–100"][i]}{" "}
                      {tr(`myco.class.${key}`)}
                    </span>
                  ))}
                  <span>
                    <i
                      style={{
                        background: "#475569",
                        border: "2px dashed currentColor",
                      }}
                    />
                    ▧ {tr("heat.unsuitable")}
                  </span>
                  <span>
                    <i style={{ border: "2px dotted currentColor" }} />?{" "}
                    {tr("heat.insufficient")}
                  </span>
                </div>
                <details>
                  <summary>{tr("heat.opacity")}</summary>
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
                  <p>
                    {tr("heat.resolution", {
                      m: String(
                        area.grid.widthM / Math.sqrt(area.cells.length),
                      ),
                    })}
                  </p>
                </details>
                <details>
                  <summary>{tr("heat.cells")}</summary>
                  <div className="heat-cells">
                    {area.cells.map((c, i) => (
                      <button
                        className="button secondary"
                        key={c.id}
                        onClick={() => onCell(i)}
                      >
                        {i + 1}:{" "}
                        {c.status === "unsuitable"
                          ? `▧ ${tr("heat.unsuitable")}`
                          : c.status === "insufficientData"
                            ? `? ${tr("heat.insufficient")}`
                            : `${c.score}/100`}
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
            {tr("heat.disclaimer")} {tr("heat.privacy")}
          </small>
        </>
      )}
    </section>
  );
}
