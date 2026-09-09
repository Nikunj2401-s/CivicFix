import { CATEGORIES, STATUS, ago } from '../lib/constants.js';

export function StatusPill({ status }) {
  const s = STATUS[status] || STATUS.pending;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: s.color }}>
      <span className="h-[7px] w-[7px] rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

/* the priority score is the thing an admin scans for, so it leads every row */
export function IssueRow({ issue, onClick }) {
  const cat = CATEGORIES[issue.category];
  return (
    <button
      onClick={onClick}
      className="grid w-full grid-cols-[52px_1fr] items-start gap-3 border-b border-rule-2 py-3 pr-4 text-left hover:bg-[#f7f9fa]"
    >
      <span className="flex flex-col border-l-4 pl-2 leading-none" style={{ borderColor: cat.color }}>
        <b className="num text-[21px] font-bold tracking-tight">{issue.priority_score}</b>
        <span className="mt-1 text-[10px] text-ink-3">PRIORITY</span>
      </span>
      <span>
        <h3 className="text-sm font-semibold">{cat.label}</h3>
        <p className="mb-1.5 line-clamp-2 text-[13px] text-ink-2">{issue.description}</p>
        <span className="flex flex-wrap items-center gap-2.5 text-xs text-ink-3">
          <StatusPill status={issue.status} />
          <span className="num">{issue.upvotes} backing</span>
          <span>{ago(issue.created_at)}</span>
        </span>
      </span>
    </button>
  );
}

export function Modal({ children, onClose }) {
  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-ink/50 p-5"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[88vh] w-full max-w-lg overflow-auto rounded-xl bg-white shadow-2xl">{children}</div>
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="px-5 py-9 text-center text-[13.5px] text-ink-2">
      <b className="mb-1 block text-[14.5px] text-ink">{title}</b>
      {children}
    </div>
  );
}
