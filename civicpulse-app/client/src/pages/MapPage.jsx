import { useMemo, useState } from 'react';
import LeafletMap from '../components/LeafletMap.jsx';
import { IssueRow, Empty, RowSkeleton } from '../components/Bits.jsx';
import IssueDetail from '../components/IssueDetail.jsx';
import { CATEGORIES, STATUS } from '../lib/constants.js';

export default function MapPage({ issues, busy, you, reload }) {
  const [cats, setCats] = useState(new Set(Object.keys(CATEGORIES)));
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('priority');
  const [open, setOpen] = useState(null);

  const counts = useMemo(() => {
    const c = {};
    issues.forEach((i) => { c[i.category] = (c[i.category] || 0) + 1; });
    return c;
  }, [issues]);

  const shown = useMemo(() => {
    const list = issues.filter((i) => cats.has(i.category) && (status === 'all' || i.status === status));
    const by = {
      priority: (a, b) => b.priority_score - a.priority_score,
      newest: (a, b) => new Date(b.created_at) - new Date(a.created_at),
      upvotes: (a, b) => b.upvotes - a.upvotes
    }[sort];
    return [...list].sort(by);
  }, [issues, cats, status, sort]);

  const toggle = (k) => {
    const next = new Set(cats);
    next.has(k) ? next.delete(k) : next.add(k);
    setCats(next);
  };
  const allOn = cats.size === Object.keys(CATEGORIES).length;

  const centre = you || (issues[0] ? [issues[0].latitude, issues[0].longitude] : [20.5937, 78.9629]);
  const openCount = issues.filter((i) => i.status !== 'resolved').length;

  return (
    <div className="grid h-full grid-rows-[46%_54%] md:grid-cols-[368px_1fr] md:grid-rows-1">
      <aside className="order-2 flex min-h-0 flex-col border-rule bg-white md:order-1 md:border-r">
        <div className="border-b border-rule-2 p-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-semibold tracking-tight">Issues nearby</h2>
            <span className="num text-[12px] text-ink-2">
              <b className="text-ink">{openCount}</b> open of {issues.length}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setCats(allOn ? new Set() : new Set(Object.keys(CATEGORIES)))}
              className="chip text-[11.5px] font-semibold"
            >
              {allOn ? 'Clear all' : 'Select all'}
            </button>
            {Object.entries(CATEGORIES).map(([k, c]) => (
              <button key={k} onClick={() => toggle(k)} className={`chip ${cats.has(k) ? 'chip-on' : ''}`}>
                <span className="h-2 w-2 rounded-sm" style={{ background: c.color }} />
                {c.label}
                <span className="num opacity-60">{counts[k] || 0}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 border-b border-rule-2 px-4 py-2.5">
          <select className="input py-1.5 text-[13px]" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            {Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          </select>
          <select className="input py-1.5 text-[13px]" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="priority">Highest priority</option>
            <option value="newest">Newest first</option>
            <option value="upvotes">Most supporters</option>
          </select>
        </div>

        <div className="min-h-0 flex-1 overflow-auto scroll-thin">
          {busy && !issues.length ? (
            <RowSkeleton />
          ) : shown.length ? (
            shown.map((i) => <IssueRow key={i.id} issue={i} onClick={() => setOpen(i.id)} />)
          ) : (
            <Empty title="Nothing matches those filters" glyph="⌕">
              Turn a category back on, or file the first report for this area.
            </Empty>
          )}
        </div>
      </aside>

      <LeafletMap
        className="order-1 h-full md:order-2"
        center={centre}
        you={you}
        issues={shown}
        onMarkerClick={(i) => setOpen(i.id)}
      />

      {open && <IssueDetail id={open} onClose={() => setOpen(null)} onChange={reload} />}
    </div>
  );
}
