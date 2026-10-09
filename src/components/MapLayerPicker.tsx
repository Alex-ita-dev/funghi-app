import { useEffect, useRef } from "react";
import { usePreferences } from "../hooks/usePreferences";
import { Check, Mountain, Satellite, Trees, Map, X } from "lucide-react";
import { mapLayers, type MapLayerId } from "../lib/maps";
const icons = {
  topo: Mountain,
  satellite: Satellite,
  outdoor: Trees,
  street: Map,
};
export function MapLayerPicker({
  selected,
  onSelect,
  onClose,
}: {
  selected: MapLayerId;
  onSelect: (id: MapLayerId) => void;
  onClose: () => void;
}) {
  const { tr } = usePreferences();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    panel.current
      ?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')
      ?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }
    };
    const outside = (event: PointerEvent) => {
      const target = event.target as Element;
      if (
        !panel.current?.contains(target) &&
        !target.closest('[aria-controls="map-layer-panel"]')
      )
        close.current();
    };
    document.addEventListener("keydown", key, true);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("pointerdown", outside);
      trigger?.focus();
    };
  }, []);
  return (
    <div
      ref={panel}
      id="map-layer-panel"
      className="map-layer-panel"
      role="region"
      aria-label={tr("Scegli la mappa")}
    >
      <header>
        <strong>{tr("Scegli la mappa")}</strong>
        <button
          className="icon-button"
          aria-label={tr("Chiudi")}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <div
        className="layer-choices"
        role="group"
        aria-label={tr("Tipo di mappa")}
      >
        {mapLayers.map((layer) => {
          const Icon = icons[layer.id];
          return (
            <button
              key={layer.id}
              className={`layer-option ${selected === layer.id ? "selected" : ""}`}
              disabled={!layer.url}
              aria-pressed={selected === layer.id}
              onClick={() => {
                onSelect(layer.id);
                onClose();
              }}
            >
              <span
                aria-hidden="true"
                className={`layer-preview layer-preview-${layer.id}`}
              >
                <Icon size={24} />
              </span>
              <span>
                <strong>{tr(layer.name)}</strong>
                <small>
                  {tr(
                    layer.url
                      ? layer.description
                      : "Al momento non disponibile",
                  )}
                </small>
              </span>
              {selected === layer.id && <Check size={18} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
