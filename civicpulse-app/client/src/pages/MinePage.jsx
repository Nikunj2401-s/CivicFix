import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { IssueRow, Empty } from '../components/Bits.jsx';
import IssueDetail from '../components/IssueDetail.jsx';
import { useAuth } from '../lib/AuthContext.jsx';

export default function MinePage({ reload }) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(null);

  const load = () => api.mine().then(setRows).catch(() => {});
  useEffect(() => { load(); }, []);

  const filed = rows.filter((i) => i.user_id === user.id);
  const backed = rows.filter((i) => i.user_id !== user.id);

  const Block = ({ title, list, empty }) => (
    <>
      <h2 className="mb-2.5 mt-6 text-[15px] font-semibold tracking-tight">{title}</h2>
      <div className="card overflow-hidden">
        {list.length ? list.map((i) => <IssueRow key={i.id} issue={i} onClick={() => setOpen(i.id)} />)
                     : <Empty title=" ">{empty}</Empty>}
      </div>
    </>
  );

  return (
    <div className="mx-auto max-w-3xl px-5 py-7">
      <h1 className="text-2xl font-bold tracking-tight">My reports</h1>
      <p className="text-sm text-ink-2">Everything you've filed or backed, with where it stands.</p>
      <Block title="Filed by you" list={filed} empty="Nothing filed yet. Spot something on your street and report it." />
      <Block title="Issues you are backing" list={backed} empty="Open the map and back a report to raise its priority." />
      {open && (
        <IssueDetail id={open} onClose={() => setOpen(null)} onChange={() => { load(); reload(); }} />
      )}
    </div>
  );
}
