import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";

export type MapPin = { id: number; lat: number; lon: number; label: string; tone?: "normal" | "closed" | "pick" };

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

function Fit({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 15);
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 16 });
  }, [map, points.map((p) => p.join(",")).join("|")]); // eslint-disable-line
  return null;
}

const youIcon = L.divIcon({ className: "", html: '<div class="youpin"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });

export function MapView({ you, pins, route, onPick, tall }: {
  you: { lat: number; lon: number };
  pins: MapPin[];
  route?: [number, number][];
  onPick?: (id: number) => void;
  tall?: boolean;
}) {
  const pts: [number, number][] = [[you.lat, you.lon], ...pins.map((p) => [p.lat, p.lon] as [number, number])];
  return (
    <div className={"mapbox" + (tall ? " tall" : "")}>
      <MapContainer center={[you.lat, you.lon]} zoom={14} style={{ height: "100%", width: "100%" }} zoomControl={false} attributionControl>
        <TileLayer url={TILE_URL} attribution="&copy; OpenStreetMap" maxZoom={19} />
        <Fit points={pts} />
        <Marker position={[you.lat, you.lon]} icon={youIcon} />
        {route && route.length > 1 && <Polyline positions={route} pathOptions={{ color: "#e2313b", weight: 4, dashArray: "6 8" }} />}
        {pins.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lon]}
            icon={L.divIcon({
              className: "",
              html: `<div class="pricepin ${p.tone === "closed" ? "closed" : p.tone === "pick" ? "pick" : ""}">${p.label}</div>`,
              iconSize: [0, 0],
            })}
            eventHandlers={{ click: () => onPick?.(p.id) }}
          />
        ))}
      </MapContainer>
    </div>
  );
}
