import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { CATEGORIES } from '../lib/constants.js';

export function pinIcon(category, dim = false) {
  const c = CATEGORIES[category];
  return L.divIcon({
    className: '',
    iconSize: [26, 26],
    iconAnchor: [13, 25],
    popupAnchor: [0, -22],
    html: `<span class="pin" style="background:${c.color};opacity:${dim ? 0.45 : 1}"><b>${c.mark}</b></span>`
  });
}
export const youIcon = () =>
  L.divIcon({ className: '', iconSize: [16, 16], iconAnchor: [8, 8], html: '<span class="you"></span>' });

/**
 * Thin wrapper over Leaflet. The map instance is created once and kept in a ref;
 * markers are rebuilt whenever the issue list changes.
 */
export default function LeafletMap({ center, issues = [], you, onMarkerClick, className = '' }) {
  const host = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const youRef = useRef(null);

  useEffect(() => {
    if (map.current) return;
    map.current = L.map(host.current, { center, zoom: 15 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  // recentre on the first GPS fix only, so later updates don't fight the user panning
  const centred = useRef(false);
  useEffect(() => {
    if (!map.current || !center || centred.current) return;
    map.current.setView(center, map.current.getZoom());
    centred.current = true;
  }, [center?.[0], center?.[1]]);

  useEffect(() => {
    if (!map.current) return;
    layer.current.clearLayers();
    issues.forEach((i) => {
      L.marker([i.latitude, i.longitude], { icon: pinIcon(i.category, i.status === 'resolved') })
        .addTo(layer.current)
        .bindPopup(
          `<div style="width:190px">
             ${i.photo_url ? `<img src="${i.photo_url}" style="width:100%;height:96px;object-fit:cover;border-radius:5px;margin-bottom:7px">` : ''}
             <b>${CATEGORIES[i.category].label}</b>
             <p style="margin:3px 0 6px;font-size:12.5px;color:#54646f">${i.description.slice(0, 100)}</p>
             <span style="font-size:12px">👍 ${i.upvotes} supporters · priority ${i.priority_score}</span>
           </div>`
        )
        .on('click', () => onMarkerClick?.(i));
    });
  }, [issues, onMarkerClick]);

  useEffect(() => {
    if (!map.current || !you) return;
    if (youRef.current) map.current.removeLayer(youRef.current);
    youRef.current = L.marker(you, { icon: youIcon() }).addTo(map.current).bindTooltip('You are here');
  }, [you?.[0], you?.[1]]);

  return <div ref={host} className={className} />;
}
