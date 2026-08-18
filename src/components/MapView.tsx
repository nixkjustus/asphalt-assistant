import { useEffect, useRef } from 'react';
import type { Job } from '../types';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default icon paths for Vite
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
});

export default function MapView({ jobs, height = '500px' }: { jobs: Job[]; height?: string }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    const validJobs = jobs.filter(j => j.lat && j.lng);
    if (!validJobs.length) return;

    // Cleanup previous instance
    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
    }

    const centerLat = validJobs.reduce((s, j) => s + (j.lat || 0), 0) / validJobs.length;
    const centerLng = validJobs.reduce((s, j) => s + (j.lng || 0), 0) / validJobs.length;

    // Ensure container is empty (Leaflet needs clean div)
    if (mapRef.current) {
      // @ts-ignore - internal Leaflet cleanup
      mapRef.current._leaflet_id = null;
    }

    try {
      const map = L.map(mapRef.current, {
        zoomControl: true,
      }).setView([centerLat, centerLng], validJobs.length === 1 ? 14 : 11);
      mapInstance.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors | Black Gold Asphalt',
        maxZoom: 19,
      }).addTo(map);

      validJobs.forEach(job => {
        const color = job.status === 'completed' ? '#27ae60' : job.status === 'in-progress' ? '#f39c12' : job.status === 'scheduled' ? '#3498db' : '#7f8c8d';
        
        const marker = L.circleMarker([job.lat!, job.lng!], {
          radius: 10,
          fillColor: color,
          color: '#000',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.9,
        }).addTo(map);

        const popupHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; min-width:200px; line-height:1.4;">
            <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
              <img src="/logo.png" style="width:28px; height:28px; object-fit:contain; background:white; border-radius:6px; border:1px solid #C5A032; padding:2px;" onerror="this.style.display='none'" />
              <strong style="font-size:13px;">${job.title}</strong>
            </div>
            <div style="font-size:12px; color:#333;">${job.customerName}</div>
            <div style="font-size:11px; color:#666;">${job.address || ''} ${job.city || ''}</div>
            <div style="margin-top:6px;">
              <span style="background:${color};color:white;padding:3px 8px;border-radius:12px;font-size:10px;font-weight:bold;">${job.status}</span>
            </div>
            ${job.squareFootage ? `<div style="margin-top:6px; font-size:11px; background:#f5f5f5; padding:4px 6px; border-radius:6px;">📐 ${job.squareFootage} sq ft ${job.asphaltTonnage ? `• ~${job.asphaltTonnage} tons` : ''}</div>` : ''}
            ${job.scheduledDate ? `<div style="font-size:11px; margin-top:4px;">📅 ${job.scheduledDate}</div>` : ''}
          </div>
        `;
        marker.bindPopup(popupHtml);
      });

      if (validJobs.length > 1) {
        const bounds = L.latLngBounds(validJobs.map(j => [j.lat!, j.lng!] as [number, number]));
        map.fitBounds(bounds.pad(0.25));
      }

      // Force map to recalculate size (fixes blank map issue)
      setTimeout(() => {
        map.invalidateSize();
      }, 100);

    } catch (e) {
      console.error('Map init error', e);
    }

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [jobs]);

  const validCount = jobs.filter(j => j.lat && j.lng).length;

  if (validCount === 0) {
    return (
      <div style={{ height }} className="bg-white rounded-xl flex flex-col items-center justify-center text-gray-500 p-6 text-center border-2 border-dashed border-gray-200">
        <img src="/logo.png" alt="Black Gold" className="w-16 h-16 object-contain mb-3 bg-white rounded-xl p-1 border" style={{ borderColor: '#C5A032' }} onError={(e:any)=>e.target.style.display='none'} />
        <div className="text-2xl mb-2">🗺️</div>
        <p className="text-sm font-bold">No geocoded jobs to map</p>
        <p className="text-xs mt-2 max-w-xs text-gray-400">
          Add addresses like "123 Main St, Columbus, OH 43215" to customers/jobs.<br/>
          When you're online, we'll auto-geocode them.<br/>
          Then map works offline too once tiles are cached.
        </p>
        <div className="mt-3 text-[10px] bg-black text-yellow-400 px-3 py-1.5 rounded-full border" style={{ borderColor: '#C5A032' }}>
          {jobs.length} total jobs • {validCount} with GPS coords
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div ref={mapRef} style={{ height, width: '100%' }} className="rounded-xl border-2 shadow-sm z-0" />
      <div className="absolute bottom-2 left-2 z-[400] bg-black/80 text-yellow-400 text-[10px] px-2 py-1 rounded-full border" style={{ borderColor: '#C5A032' }}>
        📍 {validCount} jobs • Columbus OH
      </div>
    </div>
  );
}
