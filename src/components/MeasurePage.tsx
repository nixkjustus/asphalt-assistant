import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useCompanyInfo } from '../hooks/useCompanyInfo';
import { useAppData } from '../hooks/useAppData';
import { calculateAsphaltTonnage } from '../utils/geocode';

function geodesicArea(latLngs: { lat: number; lng: number }[]): number {
  const d2r = Math.PI / 180;
  let area = 0.0;
  const len = latLngs.length;
  if (len > 2) {
    for (let i = 0; i < len; i++) {
      const p1 = latLngs[i];
      const p2 = latLngs[(i + 1) % len];
      area += (p2.lng - p1.lng) * d2r * (2 + Math.sin(p1.lat * d2r) + Math.sin(p2.lat * d2r));
    }
    area = (area * 6378137.0 * 6378137.0) / 2.0;
  }
  return Math.abs(area);
}
function haversineDistance(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng), Math.sqrt(1 - (sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng)));
  return R * c;
}
function sqMetersToSqFeet(sqM: number) { return sqM * 10.7639; }

// Multi-provider search returning multiple results
async function searchAddressMulti(query: string): Promise<{ lat: number; lng: number; displayName: string; source: string }[]> {
  if (!query.trim()) return [];
  const q = query.trim();
  const results: { lat: number; lng: number; displayName: string; source: string }[] = [];

  // Parse lat,lng directly
  const latLngMatch = q.match(/^\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*$/);
  if (latLngMatch) {
    return [{ lat: parseFloat(latLngMatch[1]), lng: parseFloat(latLngMatch[2]), displayName: `Coordinates: ${q}`, source: 'Coords' }];
  }

  // 1. ArcGIS World Geocoder - BEST for US addresses, free without key
  try {
    const url = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&singleLine=${encodeURIComponent(q)}&maxLocations=5&outFields=City,Region,Postal`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.candidates && data.candidates.length > 0) {
        data.candidates.forEach((c: any) => {
          results.push({ lat: c.location.y, lng: c.location.x, displayName: c.address, source: 'ArcGIS' });
        });
        if (results.length > 0) return results; // ArcGIS is good, return early if found
      }
    }
  } catch (e) { console.warn('ArcGIS failed', e); }

  // 2. Photon (komoot) - good for global, no key
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.features && data.features.length > 0) {
        data.features.forEach((f: any) => {
          const [lng, lat] = f.geometry.coordinates;
          const p = f.properties;
          const name = p.name ? `${p.name}${p.street ? ', ' + p.street : ''}${p.city ? ', ' + p.city : ''}${p.state ? ', ' + p.state : ''} ${p.postcode || ''}`.trim() : q;
          results.push({ lat, lng, displayName: name, source: 'Photon' });
        });
        if (results.length > 0) return results;
      }
    }
  } catch {}

  // 3. Nominatim OSM - fallback
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (res.ok) {
      const data = await res.json();
      if (data && data.length > 0) {
        data.forEach((d: any) => {
          results.push({ lat: parseFloat(d.lat), lng: parseFloat(d.lon), displayName: d.display_name, source: 'OSM' });
        });
        if (results.length > 0) return results;
      }
    }
  } catch {}

  // 4. US Census Geocoder - great for US
  try {
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(q)}&benchmark=2020&format=json`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const matches = data.result?.addressMatches;
      if (matches && matches.length > 0) {
        matches.slice(0,3).forEach((m: any) => {
          results.push({ lat: m.coordinates.y, lng: m.coordinates.x, displayName: m.matchedAddress, source: 'Census' });
        });
      }
    }
  } catch {}

  return results;
}

export default function MeasurePage() {
  const { company, logoUrl } = useCompanyInfo();
  const appData = useAppData();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const polylineRef = useRef<L.Polyline | null>(null);
  const polygonRef = useRef<L.Polygon | null>(null);

  const [points, setPoints] = useState<{ lat: number; lng: number }[]>([]);
  const [isDrawing, setIsDrawing] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<{ lat: number; lng: number; displayName: string; source: string }[]>([]);
  const [searchResult, setSearchResult] = useState<string | null>(null);
  const [mapType, setMapType] = useState<'google' | 'googleHybrid' | 'esri' | 'esriHybrid' | 'street'>('googleHybrid');
  const [enhance, setEnhance] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [isCapturing, setIsCapturing] = useState(false);
  const [history, setHistory] = useState<{ id: string; points: { lat: number; lng: number }[]; sqFt: number; address?: string; createdAt: string }[]>(() => {
    try { const raw = localStorage.getItem('bg_measurements'); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });

  const sqMeters = points.length >= 3 ? geodesicArea(points) : 0;
  const sqFeet = sqMetersToSqFeet(sqMeters);
  const acres = sqFeet / 43560;
  let perimeterMeters = 0;
  if (points.length >= 2) {
    for (let i = 0; i < points.length - 1; i++) perimeterMeters += haversineDistance(points[i], points[i + 1]);
    if (points.length >= 3) perimeterMeters += haversineDistance(points[points.length - 1], points[0]);
  }
  const perimeterFeet = perimeterMeters * 3.28084;
  const tons2_5in = sqFeet ? calculateAsphaltTonnage(sqFeet, 2.5) : 0;

  useEffect(() => { try { localStorage.setItem('bg_measurements', JSON.stringify(history)); } catch {} }, [history]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
    const map = L.map(mapRef.current, { zoomControl: false, maxZoom: 22 }).setView([39.9612, -82.9988], 19);
    mapInstance.current = map;
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (!isDrawing) return;
      const { lat, lng } = e.latlng;
      setPoints(prev => [...prev, { lat, lng }]);
    });
    setTimeout(() => map.invalidateSize(), 300);
    return () => { map.remove(); mapInstance.current = null; };
  }, []);

  // Tile layer management
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    map.eachLayer((layer: any) => { if (layer instanceof L.TileLayer) map.removeLayer(layer); });

    const googleSat = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
      maxZoom: 22, maxNativeZoom: 20, subdomains: ['mt0','mt1','mt2','mt3'], attribution: '© Google - Satellite', crossOrigin: false,
    });
    const googleHybrid = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      maxZoom: 22, maxNativeZoom: 20, subdomains: ['mt0','mt1','mt2','mt3'], attribution: '© Google - Hybrid', crossOrigin: false,
    });
    const esriSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 22, maxNativeZoom: 19, attribution: '© Esri', crossOrigin: true,
    });
    const esriLabels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 22, crossOrigin: true,
    });
    const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 22, crossOrigin: true, attribution: '© OSM',
    });

    if (mapType === 'google') googleSat.addTo(map);
    else if (mapType === 'googleHybrid') googleHybrid.addTo(map);
    else if (mapType === 'esri') esriSat.addTo(map);
    else if (mapType === 'esriHybrid') { esriSat.addTo(map); esriLabels.addTo(map); }
    else streets.addTo(map);

    // Apply enhance filter to tile pane
    const panes = map.getPane('tilePane');
    if (panes) {
      if (enhance) {
        panes.style.filter = 'contrast(1.25) saturate(1.35) brightness(1.08) sharpen(1)';
        // CSS sharpen via filter
        (panes.style as any).imageRendering = '-webkit-optimize-contrast';
      } else {
        panes.style.filter = '';
        (panes.style as any).imageRendering = '';
      }
    }
  }, [mapType, enhance]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];
    if (polylineRef.current) { map.removeLayer(polylineRef.current); polylineRef.current = null; }
    if (polygonRef.current) { map.removeLayer(polygonRef.current); polygonRef.current = null; }
    if (points.length === 0) return;
    points.forEach((pt, idx) => {
      const marker = L.marker([pt.lat, pt.lng], {
        draggable: true,
        icon: L.divIcon({
          className: 'custom-pin',
          html: `<div style="background:${company.primaryColor || '#FF8C00'}; color:black; width:34px; height:34px; border-radius:50%; border:3px solid white; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:14px; box-shadow:0 3px 8px rgba(0,0,0,0.5);">${idx + 1}</div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        }),
      }).addTo(map);
      marker.on('dragend', (e: any) => {
        const newLatLng = e.target.getLatLng();
        setPoints(prev => { const copy = [...prev]; copy[idx] = { lat: newLatLng.lat, lng: newLatLng.lng }; return copy; });
      });
      markersRef.current.push(marker);
    });
    if (points.length >= 2) {
      const latlngs = points.map(p => [p.lat, p.lng] as [number, number]);
      polylineRef.current = L.polyline(latlngs, { color: company.primaryColor || '#FF8C00', weight: 4, dashArray: '10, 10' }).addTo(map);
    }
    if (points.length >= 3) {
      const latlngs = points.map(p => [p.lat, p.lng] as [number, number]);
      polygonRef.current = L.polygon(latlngs, { color: company.primaryColor || '#FF8C00', fillColor: company.primaryColor || '#FF8C00', fillOpacity: 0.3, weight: 3 }).addTo(map);
    }
  }, [points, company.primaryColor]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) { setSearchResult('Enter address like "123 Main St Columbus OH" or lat,lng'); return; }
    if (!navigator.onLine) {
      // Still allow lat,lng even offline
      const latLngMatch = searchQuery.match(/^\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*$/);
      if (latLngMatch) {
        const lat = parseFloat(latLngMatch[1]), lng = parseFloat(latLngMatch[2]);
        if (mapInstance.current) mapInstance.current.setView([lat, lng], 20);
        setSearchResult(`Coordinates: ${lat}, ${lng} (offline mode)`);
        setSearchResults([]);
        return;
      }
      setSearchResult('Offline - search needs internet. Use My Location or type lat,lng like "39.9612, -82.9988"');
      return;
    }
    setSearching(true);
    setSearchResults([]);
    setSearchResult('Searching across 4 providers (ArcGIS, Photon, OSM, Census)...');
    const results = await searchAddressMulti(searchQuery);
    setSearching(false);
    if (results.length > 0) {
      setSearchResults(results);
      const first = results[0];
      if (mapInstance.current) {
        mapInstance.current.setView([first.lat, first.lng], 20);
      }
      setSearchResult(`Found ${results.length} result(s) - Tap a result below to fly there. Best: ${first.displayName} (${first.source})`);
    } else {
      setSearchResults([]);
      setSearchResult(`❌ Not found: "${searchQuery}". Try: "123 Main St, Grove City, OH 43123" or "Grove City OH" or "39.8567,-83.0788" or use My Location. Tip: Add city/state/zip`);
    }
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) { alert('Geolocation not supported'); return; }
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      if (mapInstance.current) {
        mapInstance.current.setView([latitude, longitude], 20);
        setSearchResult(`My location: ${latitude.toFixed(5)}, ${longitude.toFixed(5)} - Now tap to measure around you`);
        setSearchQuery(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        setSearchResults([]);
      }
    }, (err) => { alert('Location failed: ' + err.message + ' - Check permissions and try again'); }, { enableHighAccuracy: true });
  };

  return (
    <div className="space-y-4">
      {/* TOP SEARCH - ENHANCED */}
      <div className="bg-black rounded-2xl p-4 border-2 shadow-xl" style={{ borderColor: company.primaryColor }}>
        <div className="flex items-center gap-3 mb-3">
          <img src={company.logoDataUrl || '/logo.png'} alt="logo" className="w-10 h-10 bg-white rounded-xl p-1 object-contain" />
          <div>
            <h2 className="font-black text-white text-sm">📐 MEASURE - Enhanced Satellite + Search</h2>
            <p className="text-[11px] text-gray-400">Google clearest imagery + 4-provider address search + PDF export</p>
          </div>
          <div className="ml-auto flex gap-1">
            <button onClick={()=>setEnhance(!enhance)} className={`px-3 py-1.5 rounded-full text-xs font-black border-2 ${enhance ? 'bg-yellow-400 text-black border-yellow-400' : 'bg-zinc-800 text-gray-300 border-zinc-700'}`}>{enhance ? '✨ Enhanced ON' : '🎨 Enhance OFF'}</button>
          </div>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="flex-1 relative">
            <input type="text" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="🔍 Search ANY address: 123 Main St Grove City OH 43123, or lat,lng" className="w-full px-4 py-3 rounded-xl bg-zinc-900 border-2 border-zinc-700 text-white placeholder-gray-500 text-sm outline-none focus:border-orange-500" />
            {searchQuery && <button type="button" onClick={()=>{setSearchQuery(''); setSearchResults([]); setSearchResult(null);}} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">✕</button>}
          </div>
          <button type="submit" disabled={searching} className="px-6 py-3 rounded-xl bg-white text-black font-black text-sm disabled:opacity-50 min-w-[90px]">{searching ? 'Searching...' : 'Search'}</button>
          <button type="button" onClick={handleUseMyLocation} className="px-4 py-3 rounded-xl bg-zinc-800 border-2 border-zinc-700 text-white text-xs font-black hidden md:block">📍 My Location</button>
        </form>
        <button type="button" onClick={handleUseMyLocation} className="md:hidden mt-2 w-full py-2 rounded-xl bg-zinc-800 border-2 border-zinc-700 text-white text-xs font-black">📍 Use My Current Location Instead</button>

        {searchResult && <div className="mt-3 bg-zinc-900 rounded-xl px-3 py-2.5 text-xs text-yellow-400 border border-zinc-700">📍 {searchResult}</div>}

        {searchResults.length > 0 && (
          <div className="mt-3 bg-white rounded-xl overflow-hidden border-2 max-h-[200px] overflow-y-auto">
            <p className="text-[11px] font-black p-2 bg-gray-100 border-b">Top {searchResults.length} results - tap to fly there:</p>
            {searchResults.map((r, i)=>(
              <button key={i} onClick={()=>{
                if (mapInstance.current) mapInstance.current.setView([r.lat, r.lng], 20);
                setSearchResult(`${r.displayName} (${r.source})`);
                setSearchResults([]);
                setSearchQuery(r.displayName);
              }} className="w-full text-left px-3 py-2.5 hover:bg-gray-50 border-b last:border-b-0 flex justify-between items-center">
                <div className="flex-1 min-w-0"><p className="text-xs font-bold truncate">{r.displayName}</p><p className="text-[10px] text-gray-500">{r.lat.toFixed(5)}, {r.lng.toFixed(5)} • Source: {r.source}</p></div>
                <span className="text-[10px] px-2 py-1 rounded-full bg-black text-yellow-400 border font-bold ml-2" style={{ borderColor: company.primaryColor }}>Go</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-3 items-center justify-between">
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[10px] text-gray-500 font-bold mr-1 self-center">SATELLITE:</span>
            {[
              { id: 'googleHybrid', label: 'Google Clearest + Labels ⭐', desc: 'Sharpest, newest' },
              { id: 'google', label: 'Google Satellite', desc: 'Pure sat' },
              { id: 'esri', label: 'Esri Clear', desc: 'Allows PDF capture' },
              { id: 'esriHybrid', label: 'Esri + Labels', desc: 'With roads' },
              { id: 'street', label: 'Street Map', desc: 'Roads only' },
            ].map(opt=>(
              <button key={opt.id} onClick={()=>setMapType(opt.id as any)} className={`px-3 py-1.5 rounded-full text-[11px] font-bold border-2 transition ${mapType===opt.id ? 'bg-white text-black border-white shadow' : 'bg-zinc-800 text-gray-300 border-zinc-700 hover:bg-zinc-700'}`} title={opt.desc}>{opt.label}</button>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <button onClick={()=>setIsDrawing(!isDrawing)} className={`px-3 py-1.5 rounded-full text-xs font-black border-2 ${isDrawing ? 'bg-green-600 text-white border-green-600' : 'bg-red-600 text-white border-red-600'}`}>{isDrawing ? '✏️ Drawing ON - Tap map' : '⏸️ Paused'}</button>
          </div>
        </div>
        <p className="text-[10px] text-gray-500 mt-2">💡 If address not found: Try adding ZIP like "43123", or city "Grove City OH", or use coordinates. Switch to Google Clearest for sharpest, newest imagery - Esri for best PDF export (no taint). Use Enhance toggle to sharpen blurry old imagery.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* MAP */}
        <div className="flex-1 bg-white rounded-2xl border-2 overflow-hidden shadow-sm flex flex-col" style={{ borderColor: company.primaryColor }}>
          <div className="relative w-full h-[480px] md:h-[600px] bg-gray-100">
            <div ref={mapRef} className="absolute inset-0 w-full h-full" />
            <div className="absolute top-3 left-3 right-3 md:left-3 md:right-auto bg-black/90 text-white px-4 py-2.5 rounded-xl text-xs border-2 shadow-xl z-[400] pointer-events-none max-w-[90%] md:max-w-[360px]" style={{ borderColor: company.primaryColor }}>
              <p className="font-black text-yellow-400">HOW TO MEASURE:</p>
              <p className="mt-1">1. Search address above 2. Tap satellite to place gold pins 3. Drag pins to adjust 4. See tools below ↓</p>
            </div>
            <div className="absolute top-3 right-3 z-[400] bg-black text-white px-3 py-2 rounded-full text-xs font-black border-2 shadow-lg flex items-center gap-2" style={{ borderColor: company.primaryColor }}>
              <span>{points.length} pins</span>{points.length >=3 && <><span className="w-1 h-1 bg-white rounded-full"></span><span>{sqFeet.toFixed(0)} sq ft</span></>}
            </div>
          </div>
          <div className="p-2 bg-black text-white flex justify-between items-center text-[11px]">
            <span>🛰️ {mapType} • Zoom 19-20 for driveway detail • {enhance ? '✨ Enhanced clarity ON' : 'Enhance OFF'}</span>
            <span className="text-gray-400 hidden md:block">Drag pins • Tap map • Right below are tools ↓</span>
          </div>
        </div>

        {/* SIDE PANEL - ALWAYS VISIBLE */}
        <div className="w-full lg:w-[420px] flex flex-col gap-4">
          <div className="bg-white rounded-2xl border-2 shadow-sm overflow-hidden" style={{ borderColor: company.primaryColor }}>
            <div className="bg-black text-white p-3 flex items-center justify-between">
              <h3 className="font-black text-sm">📐 LIVE MEASUREMENT</h3>
              <span className="text-[10px] px-2 py-1 rounded-full bg-zinc-800 border">Columbus OH • Offline ready</span>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-black rounded-xl p-4 text-center border-2" style={{ borderColor: company.primaryColor }}><p className="text-[10px] text-gray-400 font-black">SQ FEET</p><p className="text-3xl font-black" style={{ color: company.primaryColor }}>{sqFeet.toFixed(1)}</p><p className="text-[10px] text-gray-500">{(sqFeet/43560).toFixed(4)} acres</p></div>
                <div className="bg-black rounded-xl p-4 text-center border-2 border-zinc-800"><p className="text-[10px] text-gray-400 font-black">PERIMETER</p><p className="text-xl font-black text-white">{(perimeterFeet).toFixed(0)} ft</p><p className="text-[10px] text-gray-500">{points.length} pins</p></div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-gray-50 rounded-xl p-2 border"><p className="text-[9px] text-gray-400">2"</p><p className="font-black text-sm" style={{ color: company.primaryColor }}>{(sqFeet ? calculateAsphaltTonnage(sqFeet, 2) : 0).toFixed(2)} tons</p></div>
                <div className="bg-black rounded-xl p-2 border-2" style={{ borderColor: company.primaryColor }}><p className="text-[9px] text-gray-400">2.5" Std</p><p className="font-black text-sm" style={{ color: company.primaryColor }}>{(sqFeet ? calculateAsphaltTonnage(sqFeet, 2.5) : 0).toFixed(2)} tons</p></div>
                <div className="bg-gray-50 rounded-xl p-2 border"><p className="text-[9px] text-gray-400">3"</p><p className="font-black text-sm" style={{ color: company.primaryColor }}>{(sqFeet ? calculateAsphaltTonnage(sqFeet, 3) : 0).toFixed(2)} tons</p></div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={()=>setPoints(p=>p.slice(0,-1))} disabled={points.length===0} className="py-3 rounded-xl bg-white border-2 font-black text-xs disabled:opacity-30">↩️ Undo</button>
                <button onClick={()=>{ if (points.length>0 && confirm('Clear all?')) setPoints([]); }} disabled={points.length===0} className="py-3 rounded-xl bg-red-50 border-2 border-red-200 text-red-700 font-black text-xs disabled:opacity-30">🗑️ Clear</button>
                <button onClick={async ()=>{
                  if (points.length<3) { alert('Need 3+ pins'); return; }
                  let screenshot: string | null = null;
                  try {
                    const html2canvas = (await import('html2canvas')).default;
                    const canvas = await html2canvas(mapRef.current!, { useCORS: true, scale: 1, logging: false });
                    screenshot = canvas.toDataURL('image/png');
                  } catch {}
                  const entry = { id: Date.now().toString(), points: [...points], sqFt: sqFeet, address: searchResult || searchQuery, createdAt: new Date().toISOString(), screenshot };
                  setHistory((prev:any)=>[entry, ...prev].slice(0,20));
                  alert(`Saved ${sqFeet.toFixed(0)} sq ft`);
                }} disabled={points.length<3} className="py-3 rounded-xl bg-black text-yellow-400 font-black text-xs border-2 disabled:opacity-30" style={{ borderColor: company.primaryColor }}>💾 Save</button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border-2 p-4 space-y-3" style={{ borderColor: company.primaryColor }}>
            <h4 className="font-black text-xs">📎 Attach to Job (with satellite image)</h4>
            <select value={selectedJobId} onChange={e=>setSelectedJobId(e.target.value)} className="w-full px-3 py-3 rounded-xl border-2 bg-white text-sm font-bold">
              <option value="">+ Create NEW Job from measurement</option>
              {appData.jobs.slice(-15).reverse().map((j:any)=><option key={j.id} value={j.id}>{j.title} - {j.customerName}</option>)}
            </select>
            <button onClick={async ()=>{
              if (points.length<3) { alert('Draw area first'); return; }
              let screenshot: string | null = null;
              try {
                const html2canvas = (await import('html2canvas')).default;
                const canvas = await html2canvas(mapRef.current!, { useCORS: true, scale: 1, logging: false });
                screenshot = canvas.toDataURL('image/png');
              } catch {}
              const jobsRaw = localStorage.getItem('ap_jobs');
              const jobs = jobsRaw ? JSON.parse(jobsRaw) : [];
              if (!selectedJobId) {
                const newJob: any = {
                  id: Date.now().toString(),
                  customerId: '',
                  customerName: 'Measured Area',
                  title: `Measured - ${sqFeet.toFixed(0)} sq ft`,
                  description: `Measured via satellite ${new Date().toLocaleDateString()} - ${searchResult || searchQuery} - ${points.length} pts`,
                  address: searchResult || searchQuery || '',
                  city: company.city || 'Columbus',
                  state: company.state || 'OH',
                  zip: company.zip || '',
                  status: 'potential',
                  squareFootage: Math.round(sqFeet),
                  depth: 2.5,
                  asphaltTonnage: calculateAsphaltTonnage(sqFeet, 2.5),
                  scheduledDate: new Date().toISOString().split('T')[0],
                  createdAt: new Date().toISOString(),
                  measurements: [{ id: Date.now().toString(), sqFeet, acres: sqFeet/43560, perimeterFeet, points: [...points], screenshotDataUrl: screenshot || undefined, address: searchResult || searchQuery, createdAt: new Date().toISOString() }],
                };
                jobs.push(newJob);
                localStorage.setItem('ap_jobs', JSON.stringify(jobs));
                alert(`Created NEW job with satellite image: ${sqFeet.toFixed(0)} sq ft`);
              } else {
                const idx = jobs.findIndex((j:any)=>j.id===selectedJobId);
                if (idx===-1) { alert('Job not found'); return; }
                const job = jobs[idx];
                const measurement = { id: Date.now().toString(), sqFeet, acres: sqFeet/43560, perimeterFeet, points: [...points], screenshotDataUrl: screenshot || undefined, address: searchResult || searchQuery, createdAt: new Date().toISOString() };
                jobs[idx] = { ...job, squareFootage: Math.round(sqFeet), asphaltTonnage: calculateAsphaltTonnage(sqFeet, 2.5), measurements: [...(job.measurements || []), measurement] };
                localStorage.setItem('ap_jobs', JSON.stringify(jobs));
                alert(`Added to job: ${job.title}`);
              }
              window.location.reload();
            }} disabled={points.length<3} className="w-full py-3 rounded-xl font-black text-black text-sm" style={{ background: company.primaryColor }}>
              {selectedJobId ? '📎 Add to Selected Job + Image' : '🔨 Create NEW Job + Image'}
            </button>
          </div>

          <div className="bg-white rounded-2xl border-2 p-4 space-y-3" style={{ borderColor: company.primaryColor }}>
            <h4 className="font-black text-xs">📄 Export PDF</h4>
            <button onClick={async ()=>{
              if (points.length<3) { alert('Draw area first'); return; }
              try {
                let mapImage: string | null = null;
                try {
                  const html2canvas = (await import('html2canvas')).default;
                  const canvas = await html2canvas(mapRef.current!, { useCORS: true, scale: 1.2, logging: false });
                  mapImage = canvas.toDataURL('image/png');
                } catch {}
                const { default: jsPDF } = await import('jspdf');
                const doc = new jsPDF('p','mm','a4');
                const margin = 12;
                let y = 10;
                try { if (company.logoDataUrl) doc.addImage(company.logoDataUrl, 'PNG', margin, y, 22, 22); } catch {}
                doc.setFontSize(13); doc.setFont('helvetica','bold'); doc.text(company.name, margin+28, y+8);
                doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.text(`${company.city}, ${company.state} • ${company.phone}`, margin+28, y+13);
                y+=28;
                doc.setFontSize(12); doc.setFont('helvetica','bold'); doc.text(`Measurement - ${sqFeet.toFixed(0)} sq ft`, margin, y); y+=6;
                doc.setFontSize(9); doc.text(`Address: ${searchResult || searchQuery}`, margin, y); y+=8;
                if (mapImage) { doc.addImage(mapImage, 'PNG', margin, y, 186, 100); y+=106; }
                doc.save(`Measurement_${Math.round(sqFeet)}sqft.pdf`);
              } catch (e) { alert('PDF failed: '+e); }
            }} disabled={points.length<3} className="w-full py-3 rounded-xl bg-black text-yellow-400 font-black text-sm border-2 disabled:opacity-40" style={{ borderColor: company.primaryColor }}>
              📄 Export PDF with Logo & Satellite
            </button>
          </div>

          <div className="bg-white rounded-2xl border-2 p-3">
            <h4 className="font-black text-xs mb-2">📚 Saved ({history.length})</h4>
            <div className="space-y-2 max-h-[160px] overflow-y-auto">
              {history.length===0 && <p className="text-xs text-gray-400">No saved yet.</p>}
              {history.map((entry:any)=>(
                <div key={entry.id} className="bg-gray-50 rounded-xl p-2.5 border flex justify-between items-center">
                  <div className="cursor-pointer" onClick={()=>{ setPoints(entry.points); }}>
                    <p className="font-bold text-xs">{entry.sqFt.toFixed(0)} sq ft</p>
                    <p className="text-[10px] text-gray-500 truncate max-w-[150px]">{entry.address || 'Custom'}</p>
                  </div>
                  <button onClick={()=>setPoints(entry.points)} className="text-[10px] px-2 py-1 rounded-full bg-black text-yellow-400 border font-bold">Load</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
