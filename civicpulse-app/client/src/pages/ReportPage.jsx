import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { api } from '../lib/api.js';
import { CATEGORIES, SEVERITY } from '../lib/constants.js';
import { pinIcon } from '../components/LeafletMap.jsx';
import { Modal } from '../components/Bits.jsx';

export default function ReportPage({ you, geoError, reload, goToMap }) {
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState(3);
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState(null);
  const [pos, setPos] = useState(null);          // [lat, lng]
  const [dupes, setDupes] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const host = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);

  // the GPS fix from the app shell becomes the default pin position
  useEffect(() => { if (you && !pos) setPos(you); }, [you]);

  useEffect(() => {
    if (map.current || !host.current) return;
    const start = you || [28.6139, 77.209];
    map.current = L.map(host.current, { center: start, zoom: 16 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap'
    }).addTo(map.current);
    marker.current = L.marker(start, { draggable: true, icon: pinIcon('pothole') }).addTo(map.current);
    marker.current.on('dragend', () => {
      const p = marker.current.getLatLng();
      setPos([+p.lat.toFixed(6), +p.lng.toFixed(6)]);
    });
    map.current.on('click', (e) => {
      marker.current.setLatLng(e.latlng);
      setPos([+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)]);
    });
    setTimeout(() => map.current.invalidateSize(), 60);
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (map.current && pos) { marker.current.setLatLng(pos); map.current.setView(pos, 17); }
  }, [pos?.[0], pos?.[1]]);

  useEffect(() => { if (marker.current && category) marker.current.setIcon(pinIcon(category)); }, [category]);

  const pickPhoto = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhoto(f);
    setPreview(URL.createObjectURL(f));
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return setErr('This browser has no location support.');
    navigator.geolocation.getCurrentPosition(
      (p) => setPos([+p.coords.latitude.toFixed(6), +p.coords.longitude.toFixed(6)]),
      () => setErr('Location is blocked — drag the pin instead.'),
      { enableHighAccuracy: true }
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
      setDupes(null);
      reset();
      reload();
      goToMap(created.id);
    } catch (e) {
      // 409 from the API means the server found reports within 50 m
      if (e.status === 409 && e.data?.duplicates) setDupes(e.data.duplicates);
      else setErr(e.message);
    } finally { setBusy(false); }
  };

  const support = async (id) => {
    setBusy(true);
    try { await api.upvote(id); setDupes(null); reset(); reload(); goToMap(id); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const reset = () => { setCategory(''); setDescription(''); setPhoto(null); setPreview(null); setSeverity(3); };

  return (
    <div className="mx-auto max-w-3xl px-5 py-7">
      <h1 className="text-2xl font-bold tracking-tight">Report an issue</h1>
      <p className="mb-5 text-sm text-ink-2">
        Before it's filed, the server checks whether someone already reported the same thing within 50 m.
      </p>

      <div className="card divide-y divide-rule-2">
        <section className="p-5">
          <label className="block text-[13.5px] font-semibold">Photo</label>
          <p className="mb-3 text-[12.5px] text-ink-2">A picture is what gets a work order approved. Optional.</p>
          <div className="flex items-start gap-4">
            <div className="flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-rule bg-[#f7f9fa] text-xs text-ink-3">
              {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : 'No photo yet'}
            </div>
            <div className="space-y-2">
              <input id="photo" type="file" accept="image/*" capture="environment" className="hidden" onChange={pickPhoto} />
              <label htmlFor="photo" className="btn btn-ghost btn-sm cursor-pointer">Choose photo</label>
              {photo && (
                <button className="btn btn-ghost btn-sm ml-2" onClick={() => { setPhoto(null); setPreview(null); }}>
                  Remove
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="p-5">
          <label className="block text-[13.5px] font-semibold">Category</label>
          <p className="mb-3 text-[12.5px] text-ink-2">Pick the one closest to what you're seeing.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {Object.entries(CATEGORIES).map(([k, c]) => (
              <button
                key={k}
                onClick={() => setCategory(k)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-[13.5px] font-medium ${
                  category === k ? 'border-ink ring-1 ring-ink' : 'border-rule'
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.color }} />
                {c.label}
              </button>
            ))}
          </div>
        </section>

        <section className="p-5">
          <label className="block text-[13.5px] font-semibold">How bad is it?</label>
          <p className="mb-3 text-[12.5px] text-ink-2">Severity × 10 is the base of the priority score.</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(SEVERITY).map(([n, label]) => (
              <button
                key={n}
                onClick={() => setSeverity(Number(n))}
                className={`min-w-[78px] rounded-lg border px-3 py-2 text-[13px] ${
                  severity === Number(n) ? 'border-ink bg-ink text-white' : 'border-rule bg-white'
                }`}
              >
                {label}
                <b className="num block text-[11px] font-semibold opacity-60">{n * 10} pts</b>
              </button>
            ))}
          </div>
        </section>

        <section className="p-5">
          <label className="block text-[13.5px] font-semibold" htmlFor="desc">Description</label>
          <p className="mb-3 text-[12.5px] text-ink-2">What's wrong, and what it's affecting.</p>
          <textarea
            id="desc" className="input min-h-[84px]" value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Deep pothole across the left lane outside the school gate. Two-wheelers are swerving into oncoming traffic."
          />
        </section>

        <section className="p-5">
          <label className="block text-[13.5px] font-semibold">Location</label>
          <p className="mb-3 text-[12.5px] text-ink-2">
            {you ? 'Taken from your GPS. Drag the pin if the exact spot is different.'
                 : geoError || 'Waiting for a location fix — drag the pin to set it yourself.'}
          </p>
          <div ref={host} className="h-52 rounded-lg border border-rule" />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button className="btn btn-ghost btn-sm" onClick={useMyLocation}>Use my location</button>
            <span className="num text-[12.5px] text-ink-2">
              {pos ? `Pin at ${pos[0]}, ${pos[1]}` : 'Pin not placed'}
            </span>
          </div>
        </section>

        <section className="flex flex-wrap items-center gap-3 p-5">
          <button className="btn" onClick={() => submit(false)} disabled={busy}>
            {busy ? 'Checking…' : 'Check and file report'}
          </button>
          {err && <p className="text-[13px] text-signal">{err}</p>}
        </section>
      </div>

      {dupes && (
        <Modal onClose={() => setDupes(null)}>
          <header className="border-b border-rule-2 px-5 py-4">
            <h3 className="text-[17px] font-semibold tracking-tight">Possible issue already reported nearby</h3>
            <p className="mt-1 text-[13px] text-ink-2">
              {dupes.length} open {CATEGORIES[category].label.toLowerCase()} report{dupes.length === 1 ? '' : 's'} within
              50 m of your pin. Backing an existing report raises its priority faster than filing a second one.
            </p>
          </header>
          <div className="px-5 py-4">
            {dupes.map((d) => (
              <div key={d.id} className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-rule p-3">
                <div>
                  <h4 className="text-sm font-semibold">
                    {CATEGORIES[d.category].label} · <span className="num">{d.distance_m} m away</span>
                  </h4>
                  <p className="text-[12.5px] text-ink-2">{d.description.slice(0, 110)}</p>
                  <p className="num mt-1 text-[12.5px] text-ink-3">
                    👍 {d.upvotes} supporters · priority {d.priority_score}
                  </p>
                </div>
                <button className="btn btn-sm" disabled={busy} onClick={() => support(d.id)}>
                  Support existing issue
                </button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-rule-2 px-5 py-4">
            <button className="btn btn-ghost" disabled={busy} onClick={() => submit(true)}>Create new report</button>
            <button className="btn btn-ghost" onClick={() => setDupes(null)}>Go back</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
