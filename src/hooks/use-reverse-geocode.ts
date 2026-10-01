import { useState, useEffect } from "react";

// Reverse geocode lat/lon to a city name via OpenStreetMap Nominatim (free, no key)
export function useReverseGeocode(lat: number | null, lon: number | null): string | null {
  const [placeName, setPlaceName] = useState<string | null>(null);

  useEffect(() => {
    if (lat === null || lon === null) return;

    let cancelled = false;
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10&accept-language=de`;

    fetch(url, { headers: { "Accept-Language": "de" } })
      .then((r) => r.json())
      .then((data: { address?: { city?: string; town?: string; village?: string; state?: string; country?: string } }) => {
        if (cancelled) return;
        const a = data.address;
        const city = a?.city ?? a?.town ?? a?.village ?? a?.state ?? null;
        const country = a?.country ?? null;
        if (city && country) {
          setPlaceName(`${city}, ${country}`);
        } else if (city) {
          setPlaceName(city);
        }
      })
      .catch(() => {
        // Silent fail
      });

    return () => { cancelled = true; };
  }, [lat, lon]);

  return placeName;
}
