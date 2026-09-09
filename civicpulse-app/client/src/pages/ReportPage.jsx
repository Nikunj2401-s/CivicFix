import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { api } from '../lib/api.js';
import { CATEGORIES, SEVERITY } from '../lib/constants.js';
import { pinIcon } from '../components/LeafletMap.jsx';
import { Modal, ModalHeader } from '../components/Bits.jsx';
import { useToast } from '../components/Toast.jsx';

function Section({ n, title, hint, children }) {
  return (
    <section className="p-5">
      <div className="mb-3 flex items-start gap-3">
        <span className="field-num mt-0.5">{n}</span>
        <div>
          <h2 className="text-[14px] font-semibold leading-tight">{title}</h2>
          {hint && <p className="hint">{hint}</p>}
        </div>
      </div>
      <div className="pl-9">{children}</div>
    </section>
  );
}

export default function ReportPage({ you, accuracy, geoError, reload, goToMap }) {
  const toast = useToast();
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState(3);
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState(null);
  const [pos, setPos] = useState(null);
  const [dupes, setDupes] = useState(null);
  const [address, setAddress] = useState('');
  const [pinnedByHand, setPinnedByHand] = useState(false);
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState(null);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const host = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const halo = useRef(null);

  useEffect(() => { if (you && !pos) setPos(you); }, [you]);

  useEffect(() => {
    if (map.current || !host.current) return;
    const start = you || [20.5937, 78.9629];
    map.current = L.map(host.current, { center: start, zoom: you ? 16 : 5 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap'
    }).addTo(map.current);
    map.current.on('click', (e) => {
      setPinnedByHand(true);
      setPos([+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)]);
    });
    setTimeout(() => map.current.invalidateSize(), 60);
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!map.current || !pos) return;
    if (!marker.current) {
      marker.current = L.marker(pos, { draggable: true, icon: pinIcon(category || 'pothole') }).addTo(map.current);
      marker.current.on('dragend', () => {
        const p = marker.current.getLatLng();
        setPinnedByHand(true);
        setPos([+p.lat.toFixed(6), +p.lng.toFixed(6)]);
      });
      map.current.setView(pos, 18);
    } else {
      marker.current.setLatLng(pos);
    }
  }, [pos?.[0], pos?.[1]]);

  // show how rough the fix is, so nobody trusts a 2 km guess
  useEffect(() => {
    if (!map.current || !you || !accuracy || pinnedByHand) return;
    if (halo.current) map.current.removeLayer(halo.current);
    halo.current = L.circle(you, { radius: accuracy, color: '#2b6ca3', weight: 1, fillOpacity: 0.07, interactive: false })
      .addTo(map.current);
  }, [you?.[0], you?.[1], accuracy, pinnedByHand]);

  // confirm the spot in words via OpenStreetMap's free geocoder
  useEffect(() => {
    if (!pos) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&lat=${pos[0]}&lon=${pos[1]}`);
        const data = await res.json();
        if (!cancelled) setAddress(data.display_name || '');
      } catch { /* offline or rate limited — coordinates still stand */ }
    }, 800);
    return () => { cancelled = true; clearTimeout(t); };
  }, [pos?.[0], pos?.[1]]);

  useEffect(() => { if (marker.current && category) marker.current.setIcon(pinIcon(category)); }, [category]);

  const rough = accuracy && accuracy > 100;

  const findPlace = async () => {
    const term = search.trim();
    if (term.length < 3) return;
    setSearching(true); setHits(null);
    try {
      const near = pos ? `&viewbox=${pos[1] - 0.3},${pos[0] + 0.3},${pos[1] + 0.3},${pos[0] - 0.3}` : '';
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(term)}${near}`);
      setHits(await res.json());
    } catch { toast('Address lookup unavailable — click the map instead', 'error'); }
    finally { setSearching(false); }
  };

  const takeHit = (hit) => {
    setPinnedByHand(true);
    setPos([+Number(hit.lat).toFixed(6), +Number(hit.lon).toFixed(6)]);
    setHits(null); setSearch('');
    if (map.current) map.current.setView([+hit.lat, +hit.lon], 18);
  };

  const pickPhoto = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhoto(f);
    setPreview(URL.createObjectURL(f));
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return toast('This browser has no location support', 'error');
    navigator.geolocation.getCurrentPosition(
      (p) => { setPinnedByHand(false); setPos([+p.coords.latitude.toFixed(6), +p.coords.longitude.toFixed(6)]); },
      () => toast('Location blocked — click the map to place the pin', 'error'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  };

  const build = (confirm) => {
    const fd = new FormData();
    fd.append('category', category);
    fd.append('description', description.trim());
    fd.append('severity', String(severity));
    fd.append('latitude', String(pos[0]));
    fd.append('longitude', String(pos[1]));
    if (confirm) fd.append('confirm', 'true');
    if (photo) fd.append('photo', photo);
    return fd;
  };

  const submit = async (confirm = false) => {
    setErr('');
    if (!category) return setErr('Pick a category first.');
    if (description.trim().length < 10) return setErr('Add a bit more detail — at least 10 characters.');
    if (!pos) return setErr('Place the pin on the map.');
    setBusy(true);
    try {
      const created = await api.create(build(confirm));
      setDupes(null); reset(); reload();
      toast(`Filed as #${created.id} — priority ${created.priority_score}`, 'good');
      goToMap(created.id);
    } catch (e) {
      if (e.status === 409 && e.data?.duplicates) setDupes(e.data.duplicates);
      else setErr(e.message);
    } finally { setBusy(false); }
  };

  const support = async (id) => {
    setBusy(true);
    try { await api.upvote(id); setDupes(null); reset(); reload(); toast('Backed the existing report', 'good'); goToMap(id); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  const reset = () => { setCategory(''); setDescription(''); setPhoto(null); setPreview(null); setSeverity(3); };

  const ready = category && description.trim().length >= 10 && pos;

  return (
    <div className="mx-auto max-w-3xl px-5 py-7">
      <h1 className="text-2xl font-bold tracking-tight">Report an issue</h1>
      <p className="mb-5 text-sm text-ink-2">
        Before it is filed, the server checks whether someone already reported the same thing within 50 metres.
      </p>

      <div className="card divide-y divide-rule-2">
        <Section n="1" title="Photo" hint="A picture is what gets a work order approved. Optional, but it helps.">
          <div className="flex flex-wrap items-start gap-4">
            <label
              htmlFor="photo"
              className="grid h-28 w-40 cursor-pointer place-items-center overflow-hidden rounded-xl border-2 border-dashed
                         border-rule bg-[#f7f9fa] text-center text-[12px] text-ink-3 transition hover:border-ink/30 hover:bg-rule-2"
            >
              {preview
                ? <img src={preview} alt="" className="h-full w-full object-cover" />
                : <span><span className="block text-lg">＋</span>Tap to add a photo</span>}
            </label>
            <input id="photo" type="file" accept="image/*" capture="environment" className="hidden" onChange={pickPhoto} />
            {photo && (
              <div className="space-y-1.5">
                <p className="text-[13px] font-medium">{photo.name}</p>
                <p className="num text-[12px] text-ink-3">{(photo.size / 1024 / 1024).toFixed(1)} MB</p>
                <button className="btn btn-ghost btn-sm" onClick={() => { setPhoto(null); setPreview(null); }}>Remove</button>
              </div>
            )}
          </div>
        </Section>

        <Section n="2" title="Category" hint="Pick the one closest to what you're seeing.">
          <div className="grid gap-2 sm:grid-cols-3">
            {Object.entries(CATEGORIES).map(([k, c]) => (
              <button
                key={k}
                onClick={() => setCategory(k)}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-3 text-left text-[13.5px] font-medium transition ${
                  category === k ? 'bg-ink text-white ring-1 ring-ink' : 'bg-white ring-1 ring-rule hover:ring-ink/30'
                }`}
              >
                <span className="h-3 w-3 shrink-0 rounded-[4px]" style={{ background: c.color }} />
                {c.label}
              </button>
            ))}
          </div>
        </Section>

        <Section n="3" title="How bad is it?" hint="Severity × 10 forms the base of the priority score.">
          <div className="flex flex-wrap gap-2">
            {Object.entries(SEVERITY).map(([n, label]) => (
              <button
                key={n}
                onClick={() => setSeverity(Number(n))}
                className={`min-w-[86px] rounded-xl px-3 py-2.5 text-[13px] transition ${
                  severity === Number(n) ? 'bg-ink text-white ring-1 ring-ink' : 'bg-white ring-1 ring-rule hover:ring-ink/30'
                }`}
              >
                {label}
                <b className={`num block text-[11px] font-semibold ${severity === Number(n) ? 'text-white/60' : 'text-ink-3'}`}>
                  {n * 10} pts
                </b>
              </button>
            ))}
          </div>
        </Section>

        <Section n="4" title="Description" hint="What's wrong, and what it's affecting.">
          <textarea
            className="input min-h-[96px] resize-y"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Deep pothole across the left lane outside the school gate. Two-wheelers are swerving into oncoming traffic."
          />
          <p className="num mt-1.5 text-right text-[11.5px] text-ink-3">{description.trim().length} characters</p>
        </Section>

        <Section
          n="5"
          title="Location"
          hint={
            pinnedByHand ? 'Pin placed by hand. This is the spot that gets filed.'
            : you ? 'Taken from your device. Drag the pin, or click the map, if the real spot is different.'
            : geoError || 'Waiting for a location fix — click the map to place the pin yourself.'
          }
        >
          {rough && !pinnedByHand && (
            <div className="mb-3 rounded-xl bg-amber/10 px-3.5 py-2.5 text-[12.5px] leading-relaxed ring-1 ring-amber/40">
              <b>Rough fix — about {Math.round(accuracy)} m.</b> The blue circle shows how sure your device is.
              Laptops guess from WiFi and IP, so drag the pin onto the real spot before filing.
            </div>
          )}

          <div className="mb-2.5 flex gap-2">
            <input
              className="input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && findPlace()}
              placeholder="Or search a street, landmark or area name"
            />
            <button className="btn btn-ghost btn-sm shrink-0" onClick={findPlace} disabled={searching}>
              {searching ? 'Searching…' : 'Find'}
            </button>
          </div>

          {hits && (
            <div className="mb-2.5 overflow-hidden rounded-xl ring-1 ring-rule">
              {hits.length ? hits.map((h) => (
                <button
                  key={h.place_id}
                  onClick={() => takeHit(h)}
                  className="block w-full border-b border-rule-2 px-3 py-2 text-left text-[13px] transition last:border-b-0 hover:bg-[#f7f9fa]"
                >
                  {h.display_name}
                </button>
              )) : (
                <p className="px-3 py-2 text-[13px] text-ink-2">Nothing found. Add the city name, or click the map directly.</p>
              )}
            </div>
          )}

          <div ref={host} className="h-60 overflow-hidden rounded-xl ring-1 ring-rule" />

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button className="btn btn-ghost btn-sm" onClick={useMyLocation}>
              {pinnedByHand ? 'Snap back to my location' : 'Refresh my location'}
            </button>
            <span className="num text-[12.5px] text-ink-2">
              {pos ? `${pos[0]}, ${pos[1]}` : 'Pin not placed'}
              {accuracy && !pinnedByHand ? ` (±${Math.round(accuracy)} m)` : ''}
            </span>
          </div>

          {address && (
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
              Nearest address: <span className="text-ink">{address}</span>
            </p>
          )}
        </Section>

        <div className="flex flex-wrap items-center gap-3 bg-[#f7f9fa] p-5">
          <button className="btn" onClick={() => submit(false)} disabled={busy || !ready}>
            {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
            {busy ? 'Checking…' : 'Check and file report'}
          </button>
          {!ready && !err && (
            <span className="text-[12.5px] text-ink-2">
              {!category ? 'Pick a category to continue.' : description.trim().length < 10 ? 'Add a short description.' : 'Place the pin.'}
            </span>
          )}
          {err && <p className="text-[13px] text-signal">{err}</p>}
        </div>
      </div>

      {dupes && (
        <Modal onClose={() => setDupes(null)} wide>
          <ModalHeader
            title="Possible issue already reported nearby"
            sub={`${dupes.length} open ${CATEGORIES[category].label.toLowerCase()} report${dupes.length === 1 ? '' : 's'} within 50 m`}
            accent={CATEGORIES[category].color}
            onClose={() => setDupes(null)}
          />
          <div className="px-5 py-4">
            <p className="mb-4 text-[13.5px] leading-relaxed text-ink-2">
              Backing an existing report raises its priority faster than filing a second one — and the ward
              office sees one clear issue instead of twenty.
            </p>
            {dupes.map((d) => (
              <div key={d.id} className="mb-2.5 flex flex-wrap items-center justify-between gap-3 rounded-xl p-3.5 ring-1 ring-rule">
                <div className="min-w-0 flex-1">
                  <h4 className="flex items-center gap-2 text-sm font-semibold">
                    <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: CATEGORIES[d.category].color }} />
                    {CATEGORIES[d.category].label}
                    <span className="num rounded-md bg-ink/[.06] px-1.5 py-0.5 text-[11.5px] text-ink-2">
                      {d.distance_m} m away
                    </span>
                  </h4>
                  <p className="mt-1 line-clamp-2 text-[12.5px] text-ink-2">{d.description}</p>
                  <p className="num mt-1 text-[12px] text-ink-3">▲ {d.upvotes} supporters · priority {d.priority_score}</p>
                </div>
                <button className="btn btn-sm shrink-0" disabled={busy} onClick={() => support(d.id)}>
                  Support existing issue
                </button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-rule-2 px-5 py-4">
            <button className="btn btn-ghost" disabled={busy} onClick={() => submit(true)}>
              None of these — create a new report
            </button>
            <button className="btn btn-ghost" onClick={() => setDupes(null)}>Go back</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
