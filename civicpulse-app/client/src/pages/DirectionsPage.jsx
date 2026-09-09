import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { CATEGORIES, STATUS } from '../lib/constants.js';
import { pinIcon, youIcon } from '../components/LeafletMap.jsx';
import { StatusPill, Empty } from '../components/Bits.jsx';

const fmtM = (m) => (m < 950 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 9500 ? 1 : 0)} km`);
const fmtT = (s) => {
  const m = Math.max(1, Math.round(s / 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
};

function metres(a1, o1, a2, o2) {
  const R = 6371000, t = (x) => (x * Math.PI) / 180;
  const h = Math.sin(t(a2 - a1) / 2) ** 2 + Math.cos(t(a1)) * Math.cos(t(a2)) * Math.sin(t(o2 - o1) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/* OSRM's public router — free, no key. Falls back to a straight line if unreachable. */
async function fetchRoute(a, b) {
  const url = `https://router.project-osrm.org/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}`
            + `?overview=full&geometries=geojson&steps=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('router unavailable');
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error('no route');
  return data.routes[0];
}
function straightLine(a, b) {
  const d = metres(a[0], a[1], b[0], b[1]);
  return { distance: d, duration: d / 6.5, legs: [{ steps: [] }],
           geometry: { coordinates: [[a[1], a[0]], [b[1], b[0]]] } };
}

function stepText(s) {
  const m = s.maneuver || {};
  const road = s.name?.trim() ? s.name : 'the road';
  const dir = { left: 'left', right: 'right', 'slight left': 'slightly left', 'slight right': 'slightly right',
                'sharp left': 'sharp left', 'sharp right': 'sharp right', straight: 'straight',
                uturn: 'back around' }[m.modifier] || '';
  switch (m.type) {
    case 'depart':      return `Head out along ${road}`;
    case 'turn':        return `Turn ${dir} onto ${road}`;
    case 'new name':    return `Continue onto ${road}`;
    case 'merge':       return `Merge ${dir} onto ${road}`;
    case 'on ramp':     return `Take the ramp onto ${road}`;
    case 'off ramp':    return `Take the exit toward ${road}`;
    case 'fork':        return `Keep ${dir} at the fork onto ${road}`;
    case 'end of road': return `At the end of the road turn ${dir} onto ${road}`;
    case 'roundabout':
    case 'rotary':      return `At the roundabout take exit ${m.exit || '—'} onto ${road}`;
    case 'continue':    return `Continue ${dir} on ${road}`;
    case 'arrive':      return 'Arrive at the issue';
    default:            return `Continue on ${road}`;
  }
}
function stepGlyph(s) {
  const m = (s.maneuver || {}).modifier || '', t = (s.maneuver || {}).type;
  if (t === 'arrive') return '◎';
  if (t === 'depart') return '●';
  if (m.includes('left')) return '↰';
  if (m.includes('right')) return '↱';
  if (m === 'uturn') return '↺';
  return '↑';
}

export default function DirectionsPage({ issueId, you, reload, onPickAnother }) {
  const { user, saveOffice } = useAuth();
  const toast = useToast();

  const [issue, setIssue] = useState(null);
  const [origin, setOrigin] = useState('gps');       // gps | office | pin
  const [pin, setPin] = useState(null);
  const [from, setFrom] = useState(null);
  const [route, setRoute] = useState(null);
  const [approx, setApprox] = useState(false);
  const [status, setStatus] = useState('');          // '', 'working', 'blocked', 'no-office', 'need-pin'
  const [live, setLive] = useState(false);
  const [settingOffice, setSettingOffice] = useState(false);
  const [livePos, setLivePos] = useState(null);

  const host = useRef(null);
  const map = useRef(null);
  const line = useRef(null);
  const fromMarker = useRef(null);
  const destMarker = useRef(null);
  const youMarker = useRef(null);
  const watchId = useRef(null);
  const lastRouted = useRef(null);

  useEffect(() => {
    if (!issueId) return;
    api.issue(issueId).then(setIssue).catch(() => {});
  }, [issueId]);

  /* map, created once */
  useEffect(() => {
    if (map.current || !host.current) return;
    map.current = L.map(host.current, { center: you || [20.5937, 78.9629], zoom: you ? 14 : 5 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap · routing by OSRM'
    }).addTo(map.current);
    setTimeout(() => map.current.invalidateSize(), 60);
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  /* clicking the map either drops a start pin or places the office */
  useEffect(() => {
    if (!map.current) return;
    const onClick = (e) => {
      const ll = [+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)];
      if (settingOffice) {
        saveOffice(ll[0], ll[1], 'Ward office')
          .then(() => { setSettingOffice(false); setOrigin('office'); toast('Office location saved', 'good'); })
          .catch((err) => toast(err.message, 'error'));
      } else if (origin === 'pin') {
        setPin(ll);
      }
    };
    map.current.on('click', onClick);
    return () => map.current?.off('click', onClick);
  }, [settingOffice, origin, saveOffice]);

  /* work out the route whenever the inputs change */
  useEffect(() => {
    if (!issue) return;
    let cancelled = false;

    (async () => {
      let start;
      if (origin === 'office') {
        if (!user.office) return setStatus('no-office');
        start = [user.office.latitude, user.office.longitude];
      } else if (origin === 'pin') {
        if (!pin) return setStatus('need-pin');
        start = pin;
      } else {
        try {
          start = await new Promise((res, rej) => {
            if (!navigator.geolocation) return rej(new Error('unsupported'));
            navigator.geolocation.getCurrentPosition(
              (p) => res([p.coords.latitude, p.coords.longitude]), rej,
              { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
            );
          });
        } catch { return setStatus('blocked'); }
      }
      if (cancelled) return;

      setStatus('working');
      setFrom(start);
      lastRouted.current = start;
      try {
        const r = await fetchRoute(start, [issue.latitude, issue.longitude]);
        if (!cancelled) { setRoute(r); setApprox(false); setStatus(''); }
      } catch {
        if (!cancelled) { setRoute(straightLine(start, [issue.latitude, issue.longitude])); setApprox(true); setStatus(''); }
      }
    })();

    return () => { cancelled = true; };
  }, [issue, origin, pin?.[0], pin?.[1], user.office?.latitude, user.office?.longitude]);

  /* draw it */
  useEffect(() => {
    if (!map.current || !route || !issue || !from) return;
    [line.current, fromMarker.current, destMarker.current].forEach((l) => l && map.current.removeLayer(l));

    const pts = route.geometry.coordinates.map((c) => [c[1], c[0]]);
    line.current = L.polyline(pts, {
      color: '#16232e', weight: 5, opacity: 0.85, dashArray: approx ? '8 8' : null
    }).addTo(map.current);

    destMarker.current = L.marker([issue.latitude, issue.longitude], { icon: pinIcon(issue.category) })
      .addTo(map.current).bindTooltip(CATEGORIES[issue.category].label);

    fromMarker.current = L.marker(from, {
      icon: L.divIcon({
        className: '', iconSize: [26, 26], iconAnchor: [13, 13],
        html: `<span style="display:grid;place-items:center;width:26px;height:26px;border-radius:7px;
                background:#16232e;color:#fff;font-size:11px;font-weight:700;border:2px solid #fff;
                box-shadow:0 2px 6px rgba(0,0,0,.35)">${origin === 'office' ? 'WO' : 'A'}</span>`
      })
    }).addTo(map.current);

    map.current.fitBounds(line.current.getBounds(), { padding: [50, 50] });
  }, [route, approx]);

  /* live follow */
  useEffect(() => {
    if (!live) {
      if (watchId.current !== null) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null; }
      return;
    }
    if (!navigator.geolocation) { setLive(false); return toast('No location support here', 'error'); }

    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        const here = [p.coords.latitude, p.coords.longitude];
        setLivePos(here);
        if (youMarker.current) map.current.removeLayer(youMarker.current);
        youMarker.current = L.marker(here, { icon: youIcon(), zIndexOffset: 600 }).addTo(map.current);
        map.current.panTo(here, { animate: true });

        if (!issue) return;
        const drift = lastRouted.current ? metres(here[0], here[1], lastRouted.current[0], lastRouted.current[1]) : 999;
        if (drift > 80) {
          lastRouted.current = here;
          setFrom(here);
          fetchRoute(here, [issue.latitude, issue.longitude])
            .then((r) => { setRoute(r); setApprox(false); })
            .catch(() => { setRoute(straightLine(here, [issue.latitude, issue.longitude])); setApprox(true); });
        }
      },
      () => { setLive(false); toast('Location permission denied', 'error'); },
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 }
    );
    return () => { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current); };
  }, [live, issue]);

  const markStatus = async (next) => {
    try {
      await api.setStatus(issue.id, next);
      setIssue(await api.issue(issue.id));
      reload();
      toast(`#${issue.id} moved to ${STATUS[next].label.toLowerCase()}`, 'good');
    } catch (e) { toast(e.message, 'error'); }
  };

  const useMyOffice = async () => {
    if (!navigator.geolocation) return toast('No location support here', 'error');
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        try {
          await saveOffice(+p.coords.latitude.toFixed(6), +p.coords.longitude.toFixed(6), 'Ward office');
          setOrigin('office');
          toast('Office set to where you are', 'good');
        } catch (e) { toast(e.message, 'error'); }
      },
      () => toast('Location blocked — click the map instead', 'error'),
      { enableHighAccuracy: true }
    );
  };

  if (!issueId) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12">
        <Empty title="No issue selected" glyph="◈">
          Open the dashboard and press <b>Route</b> on any report to get directions to it.
        </Empty>
        <div className="mt-4 text-center">
          <button className="btn btn-ghost" onClick={onPickAnother}>Go to the dashboard</button>
        </div>
      </div>
    );
  }

  const remaining = livePos && issue ? metres(livePos[0], livePos[1], issue.latitude, issue.longitude) : null;
  const arrived = remaining !== null && remaining < 40;
  const externalUrl = issue
    ? `https://www.google.com/maps/dir/?api=1${from ? `&origin=${from[0]},${from[1]}` : ''}` +
      `&destination=${issue.latitude},${issue.longitude}&travelmode=driving`
    : '#';
  const steps = route?.legs?.[0]?.steps || [];

  return (
    <div className="grid h-full grid-rows-[auto_1fr] md:grid-cols-[380px_1fr] md:grid-rows-1">
      <aside className="flex min-h-0 flex-col border-rule bg-white md:border-r">
        <div className="border-b border-rule-2 p-4">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight">
                {issue ? CATEGORIES[issue.category].label : 'Loading…'}
              </h2>
              {issue && (
                <p className="num mt-0.5 text-[12.5px] text-ink-2">
                  #{issue.id} · priority {issue.priority_score}
                </p>
              )}
            </div>
            {issue && <StatusPill status={issue.status} />}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[['gps', 'From my location'], ['office', 'From the office'], ['pin', 'Drop a start pin']].map(([k, label]) => (
              <button key={k} onClick={() => setOrigin(k)} className={`chip ${origin === k ? 'chip-on' : ''}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* summary */}
        <div className="border-b border-rule-2 bg-[#f7f9fa] px-4 py-3.5">
          {status === 'working' && <p className="text-[13px] text-ink-2">Working out the route…</p>}

          {status === 'blocked' && (
            <div className="text-[13px] leading-relaxed text-ink-2">
              <p className="mb-2">Your browser would not share a location.</p>
              <button className="btn btn-ghost btn-sm mr-2" onClick={() => setOrigin('office')}>Use the office</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setOrigin('pin')}>Drop a pin</button>
            </div>
          )}

          {status === 'no-office' && (
            <div className="text-[13px] leading-relaxed text-ink-2">
              <p className="mb-2">No office location saved yet.</p>
              <button className="btn btn-sm mr-2" onClick={useMyOffice}>Use my current location</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSettingOffice(true)}>Click the map</button>
            </div>
          )}

          {status === 'need-pin' && <p className="text-[13px] text-ink-2">Click anywhere on the map to set your starting point.</p>}

          {!status && route && (
            arrived ? (
              <>
                <p className="text-[22px] font-bold tracking-tight">You're here</p>
                <p className="num mt-0.5 text-[12.5px] text-ink-2">Within {Math.round(remaining)} m of the reported spot.</p>
              </>
            ) : (
              <>
                <div className="flex items-baseline gap-3">
                  <b className="num text-[28px] font-bold leading-none tracking-tight">{fmtT(route.duration)}</b>
                  <span className="num text-[17px] text-ink-2">{fmtM(route.distance)}</span>
                </div>
                <p className="num mt-1.5 text-[12.5px] text-ink-2">
                  Arriving about {new Date(Date.now() + route.duration * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {' · '}
                  {origin === 'office' ? 'from the office' : origin === 'pin' ? 'from your pin' : 'from where you are'}
                </p>
                {approx && (
                  <p className="mt-2 rounded-lg bg-amber/10 px-2.5 py-1.5 text-[12px] leading-relaxed ring-1 ring-amber/40">
                    Road routing is unreachable, so this is a straight-line estimate at 25 km/h. The distance and
                    bearing are still right.
                  </p>
                )}
                {live && (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-forest">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-forest" /> Following your location
                  </p>
                )}
              </>
            )
          )}
        </div>

        {/* turn list */}
        <div className="min-h-0 flex-1 overflow-auto scroll-thin">
          {steps.length ? steps.map((s, n) => (
            <div key={n} className={`grid grid-cols-[26px_1fr_auto] items-baseline gap-3 border-b border-rule-2 px-4 py-2.5 ${n === 0 ? 'bg-[#f2f7fb]' : ''}`}>
              <span className="text-center text-[15px] text-ink-3">{stepGlyph(s)}</span>
              <p className="text-[13.5px] leading-snug">{stepText(s)}</p>
              <span className="num whitespace-nowrap text-[11.5px] text-ink-3">{s.distance > 5 ? fmtM(s.distance) : ''}</span>
            </div>
          )) : route && !status ? (
            <p className="px-4 py-4 text-[13px] leading-relaxed text-ink-2">
              No turn list for this route. Follow the line on the map, or open it in a maps app below.
            </p>
          ) : null}
        </div>

        {/* actions */}
        <div className="flex flex-wrap gap-2 border-t border-rule-2 p-3">
          <button className="btn btn-sm" onClick={() => setLive(!live)}>
            {live ? 'Stop live location' : 'Follow my location'}
          </button>
          {issue?.status !== 'in_progress' && (
            <button className="btn btn-ghost btn-sm" onClick={() => markStatus('in_progress')}>Mark in progress</button>
          )}
          {issue?.status !== 'resolved' && (
            <button className="btn btn-ghost btn-sm" onClick={() => markStatus('resolved')}>Mark resolved</button>
          )}
          <a className="btn btn-ghost btn-sm" href={externalUrl} target="_blank" rel="noopener noreferrer">Open in Maps</a>
          <button className="btn btn-ghost btn-sm" onClick={onPickAnother}>Another issue</button>
        </div>
      </aside>

      <div className="relative min-h-[320px]">
        <div ref={host} className="h-full w-full" />
        {settingOffice && (
          <div className="absolute inset-x-3 top-3 z-[600] rounded-xl bg-ink px-4 py-3 text-[13px] text-white shadow-lg">
            Click the map to place the ward office.
            <button className="ml-3 underline" onClick={() => setSettingOffice(false)}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}
