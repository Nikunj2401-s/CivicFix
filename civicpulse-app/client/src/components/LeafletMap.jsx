import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { CATEGORIES, STATUS } from '../lib/constants.js';

export function pinIcon(category, dim = false) {
  const c = CATEGORIES[category];
  return L.divIcon({
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 27],
    popupAnchor: [0, -24],
    html: `<span class="pin" style="background:${c.color};opacity:${dim ? 0.4 : 1}"><b>${c.mark}</b></span>`
  });
}
export const youIcon = () =>
  L.divIcon({ className: '', iconSize: [16, 16], iconAnchor: [8, 8], html: '<span class="you"></span>' });

/**
 * Thin wrapper over Leaflet. The map is created once and kept in a ref;
 * markers are rebuilt whenever the issue list changes.
 */
export default function LeafletMap({ center, issues = [], you, onMarkerClick, className = '' }) {
  const host = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const youRef = useRef(null);
  const centred = useRef(false);

  useEffect(() => {
    if (map.current) return;
    map.current = L.map(host.current, { center, zoom: 15, zoomControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map.current);
    L.control.zoom({ position: 'bottomright' }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  // recentre on the first fix only, so later updates don't fight the user panning
  useEffect(() => {
    if (!map.current || !center || centred.current) return;
    map.current.setView(center, map.current.getZoom());
    centred.current = true;
  }, [center?.[0], center?.[1]]);

  useEffect(() => {
    if (!map.current) return;
    layer.current.clearLayers();
    issues.forEach((i) => {
      const s = STATUS[i.status];
      L.marker([i.latitude, i.longitude], { icon: pinIcon(i.category, i.status === 'resolved') })
        .addTo(layer.current)
        .bindPopup(
          `<div style="width:210px;font-family:inherit">
             ${i.photo_url ? `<img src="${i.photo_url}" style="width:100%;height:100px;object-fit:cover;border-radius:8px;margin-bottom:8px">` : ''}
             <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
               <span style="width:9px;height:9px;border-radius:3px;background:${CATEGORIES[i.category].color};display:inline-block"></span>
               <b style="font-size:13.5px">${CATEGORIES[i.category].label}</b>
             </div>
             <p style="margin:0 0 8px;font-size:12.5px;line-height:1.45;color:#54646f">${i.description.slice(0, 95)}${i.description.length > 95 ? '…' : ''}</p>
             <div style="display:flex;align-items:center;gap:8px;font-size:11.5px">
               <span style="color:${s.color};font-weight:700">${s.label}</span>
               <span style="color:#8a9aa4">▲ ${i.upvotes}</span>
               <span style="color:#8a9aa4">priority ${i.priority_score}</span>
             </div>
           </div>`
        )
        .on('click', () => onMarkerClick?.(i));
    });
  }, [issues, onMarkerClick]);

  useEffect(() => {
    if (!map.current || !you) return;
    if (youRef.current) map.current.removeLayer(youRef.current);
    youRef.current = L.marker(you, { icon: youIcon(), zIndexOffset: 500 })
      .addTo(map.current)
      .bindTooltip('You are here');
  }, [you?.[0], you?.[1]]);

  const recentre = () => {
    if (map.current && you) map.current.flyTo(you, 16, { duration: 0.6 });
  };

  return (
    <div className={`relative ${className}`}>
      <div ref={host} className="h-full w-full" />

      {/* legend */}
      <div className="pointer-events-none absolute left-3 top-3 z-[500] hidden rounded-xl bg-white/95 px-3 py-2.5 shadow-md backdrop-blur sm:block">
        <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-3">Categories</p>
        <div className="space-y-1">
          {Object.entries(CATEGORIES).map(([k, c]) => (
            <div key={k} className="flex items-center gap-2 text-[11.5px] text-ink-2">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: c.color }} />
              {c.label}
            </div>
          ))}
        </div>
      </div>

      {you && (
        <button
          onClick={recentre}
          className="absolute bottom-24 right-3 z-[500] grid h-10 w-10 place-items-center rounded-xl bg-white text-ink shadow-md transition hover:bg-rule-2"
          title="Centre on my location"
        >
          ◎
        </button>
      )}
    </div>
  );
}
