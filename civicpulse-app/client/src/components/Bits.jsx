import { CATEGORIES, STATUS, ago } from '../lib/constants.js';

/* A priority score means nothing on its own — band it so a glance is enough. */
export function priorityBand(score) {
  if (score >= 40) return { label: 'High', bg: 'bg-signal/10', text: 'text-signal', dot: '#c7422f' };
  if (score >= 25) return { label: 'Medium', bg: 'bg-amber/15', text: 'text-[#9a6a15]', dot: '#d9962b' };
  return { label: 'Low', bg: 'bg-ink/[.06]', text: 'text-ink-2', dot: '#8a9aa4' };
}

export function StatusPill({ status, className = '' }) {
  const s = STATUS[status] || STATUS.pending;
  return (
    <span
      className={`badge ${className}`}
      style={{ background: `${s.color}18`, color: s.color }}
    >
      <span className="h-[6px] w-[6px] rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

export function CategoryTag({ category }) {
  const c = CATEGORIES[category];
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: c.color }} />
      {c.label}
    </span>
  );
}

export function PriorityBlock({ score }) {
  const band = priorityBand(score);
  return (
    <span className={`flex w-[54px] shrink-0 flex-col items-center rounded-lg py-1.5 ${band.bg}`}>
      <b className={`num text-[20px] font-bold leading-none tracking-tight ${band.text}`}>{score}</b>
      <span className={`mt-1 text-[9.5px] font-bold uppercase tracking-wide ${band.text}`}>{band.label}</span>
    </span>
  );
}

export function IssueRow({ issue, onClick, showId = false }) {
  const cat = CATEGORIES[issue.category];
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-start gap-3 border-b border-rule-2 px-4 py-3 text-left transition
                 last:border-b-0 hover:bg-[#f7f9fa]"
    >
      <span className="h-full w-1 shrink-0 self-stretch rounded-full" style={{ background: cat.color }} />
      <PriorityBlock score={issue.priority_score} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <CategoryTag category={issue.category} />
          <StatusPill status={issue.status} />
        </span>
        <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink-2">{issue.description}</p>
        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-3">
          <span className="num font-semibold text-ink-2">▲ {issue.upvotes}</span>
          <span>{ago(issue.created_at)}</span>
          {showId && <span className="num">#{issue.id}</span>}
          {issue.backed_by_me && <span className="text-forest">you back this</span>}
        </span>
      </span>
    </button>
  );
}

export function Modal({ children, onClose, wide = false }) {
  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end justify-center bg-ink/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-5"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`max-h-[92vh] w-full overflow-auto rounded-t-2xl bg-white shadow-2xl scroll-thin sm:rounded-2xl ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({ title, sub, onClose, accent }) {
  return (
    <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-rule-2 bg-white/95 px-5 py-4 backdrop-blur">
      {accent && <span className="mt-1 h-6 w-1.5 rounded-full" style={{ background: accent }} />}
      <div className="min-w-0 flex-1">
        <h3 className="text-[17px] font-semibold tracking-tight">{title}</h3>
        {sub && <p className="num mt-0.5 text-[12.5px] text-ink-2">{sub}</p>}
      </div>
      <button
        onClick={onClose}
        aria-label="Close"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-3 transition hover:bg-rule-2 hover:text-ink"
      >
        ✕
      </button>
    </header>
  );
}

export function Empty({ title, children, glyph = '◎' }) {
  return (
    <div className="px-6 py-12 text-center">
      <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-rule-2 text-lg text-ink-3">
        {glyph}
      </div>
      <b className="block text-[14.5px]">{title}</b>
      <p className="mx-auto mt-1 max-w-xs text-[13px] leading-relaxed text-ink-2">{children}</p>
    </div>
  );
}

export function RowSkeleton({ n = 4 }) {
  return (
    <div className="divide-y divide-rule-2">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex gap-3 px-4 py-3.5">
          <div className="skel h-11 w-[54px]" />
          <div className="flex-1 space-y-2">
            <div className="skel h-3.5 w-1/3" />
            <div className="skel h-3 w-full" />
            <div className="skel h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Stat({ value, label, accent = false }) {
  return (
    <div className="card p-4">
      <b className={`num block text-[26px] font-bold leading-none tracking-tight ${accent ? 'text-amber' : ''}`}>
        {value ?? '—'}
      </b>
      <span className="mt-1.5 block text-[12.5px] text-ink-2">{label}</span>
    </div>
  );
}
