import { usePreferences } from "../hooks/usePreferences";
import { Check, Layers } from "lucide-react";
import { Modal } from "./Modal";
import { mapLayers, type MapLayerId } from "../lib/maps";
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
  return (
    <Modal title={tr("Scegli la mappa")} onClose={onClose}>
      <div
        className="layer-choices"
        role="group"
        aria-label={tr("Tipo di mappa")}
      >
        {mapLayers.map((layer) => (
          <button
            key={layer.id}
            className={`choice-button ${selected === layer.id ? "selected" : ""}`}
            disabled={!layer.url}
            aria-pressed={selected === layer.id}
            onClick={() => {
              onSelect(layer.id);
              onClose();
            }}
          >
            <Layers size={22} />
            <span>
              <strong>{tr(layer.name)}</strong>
              <small>{tr(layer.description)}</small>
              {!layer.url && (
                <small>
                  {tr("Da configurare: chiave MapTiler del progetto")}
                </small>
              )}
            </span>
            {selected === layer.id && <Check size={20} />}
          </button>
        ))}
      </div>
      <p className="modal-description">
        {" "}
        {tr(
          "La topografica mostra curve di livello e rilievo. Pendenze numeriche e filtro dei versanti non sono ancora disponibili. Le nuove aree della mappa richiedono internet.",
        )}{" "}
      </p>
    </Modal>
  );
}
