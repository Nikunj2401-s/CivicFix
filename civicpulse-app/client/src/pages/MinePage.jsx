import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { IssueRow, Empty, RowSkeleton, Stat } from '../components/Bits.jsx';
import IssueDetail from '../components/IssueDetail.jsx';
import { useAuth } from '../lib/AuthContext.jsx';

export default function MinePage({ reload }) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(true);
  const [open, setOpen] = useState(null);

  const load = () => {
    setBusy(true);
    api.mine().then(setRows).catch(() => {}).finally(() => setBusy(false));
  };
  useEffect(() => { load(); }, []);

  const filed = rows.filter((i) => i.user_id === user.id);
  const backed = rows.filter((i) => i.user_id !== user.id);
  const resolved = filed.filter((i) => i.status === 'resolved').length;

  const Block = ({ title, list, empty, glyph }) => (
    <>
      <h2 className="mb-2.5 mt-7 flex items-center gap-2 text-[15px] font-semibold tracking-tight">
        {title}
        <span className="num rounded-md bg-ink/[.06] px-1.5 py-0.5 text-[11.5px] font-semibold text-ink-2">
          {list.length}
        </span>
      </h2>
      <div className="card overflow-hidden">
        {busy ? <RowSkeleton n={2} />
              : list.length ? list.map((i) => <IssueRow key={i.id} issue={i} showId onClick={() => setOpen(i.id)} />)
              : <Empty title="Nothing here yet" glyph={glyph}>{empty}</Empty>}
      </div>
    </>
  );

  return (
    <div className="mx-auto max-w-3xl px-5 py-7">
      <h1 className="text-2xl font-bold tracking-tight">My reports</h1>
      <p className="mb-5 text-sm text-ink-2">Everything you've filed or backed, and where it stands.</p>

      <div className="grid grid-cols-3 gap-2.5">
        <Stat value={filed.length} label="Filed by you" />
        <Stat value={resolved} label="Resolved" />
        <Stat value={backed.length} label="Backed" />
      </div>

      <Block title="Filed by you" list={filed} glyph="＋"
             empty="Spot something on your street and file the first one." />
      <Block title="Issues you are backing" list={backed} glyph="▲"
             empty="Open the map and back a report to raise its priority." />

      {open && <IssueDetail id={open} onClose={() => setOpen(null)} onChange={() => { load(); reload(); }} />}
    </div>
  );
}
