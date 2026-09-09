import { createContext, useCallback, useContext, useState } from 'react';

const Ctx = createContext(() => {});
export const useToast = () => useContext(Ctx);

/** Small bottom-centre confirmations. Nothing else in the app needs to know how they work. */
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const push = useCallback((message, tone = 'default') => {
    const id = Math.random().toString(36).slice(2);
    setItems((cur) => [...cur, { id, message, tone }]);
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), 3200);
  }, []);

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[3000] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-[13.5px]
                        font-medium text-white shadow-lg ${
                          t.tone === 'error' ? 'bg-signal' : t.tone === 'good' ? 'bg-forest' : 'bg-ink'
                        }`}
          >
            <span className="grid h-4 w-4 place-items-center rounded-full bg-white/25 text-[10px]">
              {t.tone === 'error' ? '!' : '✓'}
            </span>
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
