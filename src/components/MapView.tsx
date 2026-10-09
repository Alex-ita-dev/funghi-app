import { usePreferences } from "../hooks/usePreferences";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { readMapViewport, writeMapViewport, type MapLayer } from "../lib/maps";
import {
  type Car,
  type Coordinate,
  type Find,
  type Fix,
  type Trip,
  segments,
} from "../lib/model";

export type MapViewRequest = {
  id: number;
  center?: Coordinate;
  bounds?: Coordinate[];
};
type Props = {
  baseLayer: MapLayer;
  onFallback: () => void;
  fix: Fix | null;
  car: Car | null;
  finds: Find[];
  trip?: Trip;
  request: MapViewRequest | null;
  picking: boolean;
  onPick: (p: Coordinate) => void;
  onFind: (p: Find) => void;
  visible: boolean;
};
const icons = {
  car: '<svg viewBox="0 0 24 24"><path d="m5 10 2-5h10l2 5M4 10h16v8H4zM7 18v2m10-2v2M7 13h1m8 0h1"/></svg>',
  find: '<svg viewBox="0 0 24 24"><path d="M3 13a9 9 0 0 1 18 0H3Zm6 0-1 7h8l-1-7M8 8h.01M15 7h.01M12 10h.01"/></svg>',
  spot: '<svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/></svg>',
};
function markerIcon(kind: keyof typeof icons) {
  return L.divIcon({
    className: "map-pin-wrap",
    html: `<span class="map-pin ${kind}">${icons[kind]}</span>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });
}
export default function MapView(props: Props) {
  const { tr, settings } = usePreferences();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<L.LayerGroup | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [tilesFailed, setTilesFailed] = useState(false);
  const [tileAttempt, setTileAttempt] = useState(0);
  useEffect(() => {
    const saved = readMapViewport();
    const m = L.map(container.current!, {
      zoomControl: false,
      center: saved ? [saved.lat, saved.lng] : [43.5206, 11.4874],
      zoom: saved?.zoom ?? 13,
      minZoom: 0,
      maxZoom: 19,
      preferCanvas: true,
    });
    map.current = m;
    layers.current = L.layerGroup().addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => {
      if (latest.current.picking)
        latest.current.onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    const remember = () => {
      const center = m.getCenter().wrap();
      writeMapViewport({ lat: center.lat, lng: center.lng, zoom: m.getZoom() });
    };
    m.on("moveend", remember);
    const observer = new ResizeObserver(() => m.invalidateSize());
    observer.observe(container.current!);
    return () => {
      observer.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    if (!map.current) return;
    const zoom = L.control
      .zoom({
        position: "topright",
        zoomInTitle: tr("Ingrandisci"),
        zoomOutTitle: tr("Riduci"),
      })
      .addTo(map.current);
    const imperial = settings.preferences.distanceUnit === "imperial";
    const scale = L.control
      .scale({ metric: !imperial, imperial, position: "bottomleft" })
      .addTo(map.current);
    return () => {
      zoom.remove();
      scale.remove();
    };
  }, [tr, settings.preferences.distanceUnit]);
  useEffect(() => {
    const m = map.current;
    const source = props.baseLayer;
    if (!m || !source.url) return;
    let alive = true;
    const failedTiles = new Set<HTMLElement>();
    let loaded = 0;
    let fallbackSent = false;
    const fallback = () => {
      if (!alive || fallbackSent) return;
      setTilesFailed(true);
      fallbackSent = true;
      latest.current.onFallback();
    };
    // Bound stalled requests too, without repeatedly cycling providers.
    let timeout = window.setTimeout(fallback, 10000);
    setTilesFailed(false);
    const tiles = L.tileLayer(source.url, {
      maxZoom: 19,
      maxNativeZoom: source.maxNativeZoom,
      attribution: source.attribution,
      keepBuffer: 1,
    });
    tiles.on("loading", () => {
      loaded = 0;
      failedTiles.clear();
      clearTimeout(timeout);
      timeout = window.setTimeout(fallback, 10000);
    });
    tiles.on("tileload", () => {
      loaded++;
      clearTimeout(timeout);
    });
    tiles.on("tileerror", (event: L.TileErrorEvent) => {
      failedTiles.add(event.tile);
      if (alive) setTilesFailed(true);
    });
    tiles.on("tileunload", (event: L.TileEvent) => {
      failedTiles.delete(event.tile);
      if (alive) setTilesFailed(failedTiles.size > 0);
    });
    tiles.on("load", () => {
      clearTimeout(timeout);
      if (!alive) return;
      setTilesFailed(failedTiles.size > 0);
      if (failedTiles.size > 0 && loaded === 0) fallback();
    });
    tiles.addTo(m);
    return () => {
      alive = false;
      clearTimeout(timeout);
      // Leaflet uses the remove event to detach map listeners and attribution.
      // Keep that internal listener alive until removal has completed.
      tiles.remove();
      tiles.off();
    };
  }, [props.baseLayer, tileAttempt]);
  useEffect(() => {
    const layer = layers.current;
    if (!layer) return;
    layer.clearLayers();
    if (props.trip)
      for (const segment of segments(props.trip.points)) {
        if (segment.length > 1) {
          const points = segment.map((p) => [p.lat, p.lng] as L.LatLngTuple);
          L.polyline(points, {
            color: "#fffdf6",
            weight: 8,
            opacity: 0.9,
          }).addTo(layer);
          L.polyline(points, { color: "#bd581f", weight: 4 }).addTo(layer);
        } else if (segment[0])
          L.circleMarker([segment[0].lat, segment[0].lng], {
            radius: 3,
            color: "#bd581f",
          }).addTo(layer);
      }
    if (props.car)
      L.marker([props.car.lat, props.car.lng], {
        icon: markerIcon("car"),
        title: tr("Posizione auto"),
      })
        .bindTooltip(tr("La tua auto"))
        .addTo(layer);
    for (const find of props.finds) {
      const label = document.createElement("span");
      label.textContent = find.title;
      L.marker([find.lat, find.lng], {
        icon: markerIcon(find.kind),
        title: find.title,
      })
        .bindTooltip(label)
        .on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          latest.current.onFind(find);
        })
        .addTo(layer);
    }
    if (props.fix) {
      const { lat, lng, accuracy } = props.fix;
      L.circle([lat, lng], {
        radius: accuracy,
        color: "#3976aa",
        weight: 1,
        fillOpacity: 0.07,
      }).addTo(layer);
      L.circleMarker([lat, lng], {
        radius: 7,
        color: "#fff",
        weight: 3,
        fillColor: "#3976aa",
        fillOpacity: 1,
      })
        .bindTooltip(tr("Ultima posizione rilevata"))
        .addTo(layer);
    }
  }, [props.fix, props.car, props.finds, props.trip, tr]);
  const appliedRequest = useRef<MapViewRequest | null>(null);
  useEffect(() => {
    const m = map.current;
    const request = props.request;
    if (!m) return;
    m.invalidateSize();
    if (!request || request === appliedRequest.current) return;
    appliedRequest.current = request;
    if (request.bounds?.length)
      m.fitBounds(L.latLngBounds(request.bounds.map((p) => [p.lat, p.lng])), {
        padding: [45, 70],
        maxZoom: 17,
        animate: false,
      });
    else if (request.center)
      m.setView([request.center.lat, request.center.lng], 16, {
        animate: false,
      });
  }, [props.request, props.visible]);
  return (
    <>
      <div
        ref={container}
        className={`leaflet-map ${props.picking ? "picking" : ""}`}
        aria-label={tr("Mappa interattiva")}
      />
      {tilesFailed && !props.picking && (
        <div className="map-error" role="status">
          <span>
            {" "}
            {tr(
              "Cartografia incompleta o non disponibile. Punti e tracce restano visibili; per nuove aree serve internet.",
            )}{" "}
          </span>
          <button onClick={() => setTileAttempt((value) => value + 1)}>
            {" "}
            {tr("Riprova mappa")}{" "}
          </button>
        </div>
      )}
    </>
  );
}
