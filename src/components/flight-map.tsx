import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type LatLon = { lat: number; lon: number };

type Props = {
  lat: number;
  lon: number;
  heading: number | null;
  label?: string;
  trail?: LatLon[];   // ordered oldest → newest
};

// Build a rotated SVG aircraft icon
function makeIcon(heading: number | null) {
  const deg = heading ?? 0;
  return L.divIcon({
    className: "",
    html: `<div style="
      width:32px;height:32px;display:flex;align-items:center;justify-content:center;
      font-size:26px;line-height:1;
      transform:rotate(${deg}deg);
      filter:drop-shadow(0 0 10px rgba(220,160,30,0.9));
      transition:transform 1.2s ease;
    ">✈</div>`,
    iconAnchor: [16, 16],
    iconSize: [32, 32],
  });
}

export default function FlightMap({ lat, lon, heading, label, trail = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<L.Map | null>(null);
  const markerRef    = useRef<L.Marker | null>(null);
  const polyRef      = useRef<L.Polyline | null>(null);
  const dotLayerRef  = useRef<L.LayerGroup | null>(null);

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [lat, lon],
      zoom: 8,
      zoomControl: true,
      attributionControl: false,
    });

    // Dark aviation tile
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
    }).addTo(map);

    // Trail polyline — gold with fade
    const poly = L.polyline(
      trail.map(p => [p.lat, p.lon] as L.LatLngTuple),
      { color: "rgba(220,160,30,0.55)", weight: 2.5, dashArray: "6 5", lineCap: "round" }
    ).addTo(map);
    polyRef.current = poly;

    // Dot layer for each trail waypoint
    const dots = L.layerGroup().addTo(map);
    trail.forEach((p, i) => {
      const opacity = 0.15 + 0.6 * (i / Math.max(trail.length - 1, 1));
      L.circleMarker([p.lat, p.lon], {
        radius: 3,
        color: "transparent",
        fillColor: `rgba(220,160,30,${opacity.toFixed(2)})`,
        fillOpacity: 1,
      }).addTo(dots);
    });
    dotLayerRef.current = dots;

    // Aircraft marker
    const marker = L.marker([lat, lon], { icon: makeIcon(heading), zIndexOffset: 1000 }).addTo(map);
    if (label) marker.bindTooltip(label, { permanent: false, direction: "top", className: "leaflet-aircraft-tip" });
    markerRef.current = marker;

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      polyRef.current = null;
      dotLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update position + heading
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    const newPos: L.LatLngTuple = [lat, lon];
    markerRef.current.setLatLng(newPos);
    markerRef.current.setIcon(makeIcon(heading));
    mapRef.current.panTo(newPos, { animate: true, duration: 1.5 });
  }, [lat, lon, heading]);

  // Update trail when new points arrive
  useEffect(() => {
    if (!mapRef.current || !polyRef.current || !dotLayerRef.current) return;
    const latlngs = trail.map(p => [p.lat, p.lon] as L.LatLngTuple);
    polyRef.current.setLatLngs(latlngs);

    // Rebuild dots
    dotLayerRef.current.clearLayers();
    trail.forEach((p, i) => {
      const opacity = 0.15 + 0.6 * (i / Math.max(trail.length - 1, 1));
      L.circleMarker([p.lat, p.lon], {
        radius: 3,
        color: "transparent",
        fillColor: `rgba(220,160,30,${opacity.toFixed(2)})`,
        fillOpacity: 1,
      }).addTo(dotLayerRef.current!);
    });

    // Auto-fit when we have more than 2 points
    if (trail.length >= 2) {
      const bounds = L.latLngBounds(latlngs);
      mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 10, animate: true });
    }
  }, [trail]);

  return (
    <>
      <style>{`
        .leaflet-aircraft-tip {
          background: rgba(10,8,4,0.85) !important;
          border: 1px solid rgba(220,160,30,0.4) !important;
          color: rgb(220,160,30) !important;
          font-family: 'Cinzel', serif;
          font-size: 11px;
          letter-spacing: 0.12em;
          border-radius: 6px;
          padding: 3px 8px;
          box-shadow: none;
        }
        .leaflet-aircraft-tip::before { display:none; }
        .leaflet-control-zoom {
          border: 1px solid rgba(220,160,30,0.25) !important;
          border-radius: 8px !important;
        }
        .leaflet-control-zoom a {
          background: rgba(10,8,4,0.85) !important;
          color: rgba(220,160,30,0.8) !important;
          border-color: rgba(220,160,30,0.2) !important;
        }
        .leaflet-control-zoom a:hover {
          background: rgba(220,160,30,0.15) !important;
        }
      `}</style>
      <div
        ref={containerRef}
        className="w-full rounded-xl overflow-hidden border border-border"
        style={{ height: "260px" }}
      />
    </>
  );
}
