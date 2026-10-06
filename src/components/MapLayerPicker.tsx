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
  return (
    <Modal title="Scegli la mappa" onClose={onClose}>
      <div className="layer-choices" role="group" aria-label="Tipo di mappa">
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
              <strong>{layer.name}</strong>
              <small>{layer.description}</small>
              {!layer.url && (
                <small>Da configurare: chiave MapTiler del progetto</small>
              )}
            </span>
            {selected === layer.id && <Check size={20} />}
          </button>
        ))}
      </div>
      <p className="modal-description">
        La topografica mostra curve di livello e rilievo. Pendenze numeriche e
        filtro dei versanti non sono ancora disponibili. Le nuove aree della
        mappa richiedono internet.
      </p>
    </Modal>
  );
}
