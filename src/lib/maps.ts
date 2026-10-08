export type MapLayerId = "topo" | "satellite" | "outdoor" | "street";
export type MapLayer = {
  id: MapLayerId;
  name: string;
  description: string;
  url: string | null;
  attribution: string;
  maxNativeZoom: number;
};
const osm =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';
const maptiler =
  '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener noreferrer">&copy; MapTiler</a> | ' +
  osm;

export function createMapLayers(publicKey = ""): readonly MapLayer[] {
  const key = encodeURIComponent(publicKey.trim());
  return [
    {
      id: "topo",
      name: "Topografica",
      description: "Sentieri, curve di livello e rilievo · OpenTopoMap",
      url: "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
      attribution:
        osm +
        ' · SRTM | <a href="https://opentopomap.org" target="_blank" rel="noopener noreferrer">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener noreferrer">CC-BY-SA</a>)',
      maxNativeZoom: 17,
    },
    {
      id: "satellite",
      name: "Satellite",
      description: "Immagini del territorio · MapTiler",
      url: key
        ? `https://api.maptiler.com/tiles/satellite-v4/{z}/{x}/{y}.jpg?key=${key}`
        : null,
      attribution: maptiler,
      maxNativeZoom: 19,
    },
    {
      id: "outdoor",
      name: "Outdoor / Sentieri",
      description: "Sentieri e rilievo ombreggiato · MapTiler",
      url: key
        ? `https://api.maptiler.com/maps/outdoor-v4/256/{z}/{x}/{y}.png?key=${key}`
        : null,
      attribution: maptiler,
      maxNativeZoom: 19,
    },
    {
      id: "street",
      name: "Stradale",
      description: "Strade e punti di riferimento · OpenStreetMap",
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: osm,
      maxNativeZoom: 19,
    },
  ];
}
export const mapLayers = createMapLayers(import.meta.env.VITE_MAPTILER_KEY);
export function resolveMapLayer(value: unknown, layers = mapLayers): MapLayer {
  return layers.find((layer) => layer.id === value && layer.url) ?? layers[0];
}
export const mapPreferenceKey = "mycotrail.map-layer.v2";
export function readMapPreference(): MapLayerId {
  try {
    const value = localStorage.getItem(mapPreferenceKey);
    return mapLayers.some((layer) => layer.id === value)
      ? (value as MapLayerId)
      : "topo";
  } catch {
    return "topo";
  }
}

// Future DEM contract; no provider is selected and no terrain data is fabricated.
export type DemSource = {
  urlTemplate: string;
  encoding: "mapbox" | "terrarium";
  attribution: string;
  resolutionMetres: number;
  noDataValue: number | null;
};
export type Aspect = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
export type TerrainSample = {
  elevationM: number | null;
  slopeDeg: number | null;
  aspectDeg: number | null;
};

// Presentation-only state, separate from the journal and its backup format.
export const mapViewportKey = "mycotrail.map-viewport.v1";
export type MapViewport = { lat: number; lng: number; zoom: number };
export function readMapViewport(): MapViewport | null {
  try {
    const value = JSON.parse(localStorage.getItem(mapViewportKey) ?? "null");
    if (
      !value ||
      !Number.isFinite(value.lat) ||
      Math.abs(value.lat) > 85.051129 ||
      !Number.isFinite(value.lng) ||
      Math.abs(value.lng) > 180 ||
      !Number.isFinite(value.zoom) ||
      value.zoom < 0 ||
      value.zoom > 19
    )
      return null;
    return { lat: value.lat, lng: value.lng, zoom: value.zoom };
  } catch {
    return null;
  }
}
export function writeMapViewport(value: MapViewport): void {
  try {
    localStorage.setItem(mapViewportKey, JSON.stringify(value));
  } catch {
    /* Browsing the map must work with storage disabled/full. */
  }
}
