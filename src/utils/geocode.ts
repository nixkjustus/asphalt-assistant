export async function geocodeAddress(address: string, city: string, state: string, zip: string): Promise<{ lat: number; lng: number } | null> {
  const query = `${address}, ${city}, ${state} ${zip}`.trim();
  if (!query || query.length < 5) return null;

  // Try Nominatim (OpenStreetMap) - free, no API key needed, respects offline
  try {
    if (!navigator.onLine) return null;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!res.ok) throw new Error('geocode failed');
    const data = await res.json();
    if (data && data[0]) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (e) {
    console.warn('Geocode error', e);
  }
  return null;
}

export function calculateAsphaltTonnage(squareFootage: number, depthInches: number): number {
  if (!squareFootage || !depthInches) return 0;
  // Asphalt density ~145 lb per cu ft
  // Volume cu ft = sqft * (depth/12)
  // Weight tons = volume * 145 / 2000
  const depthFeet = depthInches / 12;
  const cubicFeet = squareFootage * depthFeet;
  const pounds = cubicFeet * 145;
  const tons = pounds / 2000;
  // Add 10% waste/compaction factor
  return Math.round(tons * 1.1 * 100) / 100;
}

export function calculateTackCoat(squareFootage: number): number {
  // ~0.05 gal per sq ft
  return Math.round(squareFootage * 0.05 * 100) / 100;
}
