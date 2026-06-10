"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** Label for the destructive/affirmative button. Defaults to "Confirm". */
  confirmLabel?: string;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const Ctx = createContext<ConfirmFn | null>(null);

/** Promise-based replacement for window.confirm, styled like the rest of grit. */
export function useConfirm(): ConfirmFn {
  const v = useContext(Ctx);
  if (!v) throw new Error("useConfirm must be used within ConfirmProvider");
  return v;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [req, setReq] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      // A new request settles any stale one as cancelled.
      resolver.current?.(false);
      resolver.current = resolve;
      setReq(opts);
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setReq(null);
  }, []);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") settle(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [req, settle]);

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {req && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={req.title}
          onClick={() => settle(false)}
        >
          <div
            className="animate-pop w-full max-w-sm p-6 clay"
            style={{ background: "var(--surface)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-lg font-extrabold tracking-tight">{req.title}</p>
            {req.message && (
              <p className="mt-1.5 text-sm font-medium text-ink-soft">
                {req.message}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => settle(false)}
                className="clay-press px-4 py-2 text-sm font-bold"
                style={{
                  background: "var(--page-2)",
                  color: "var(--ink-soft)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                autoFocus
                onClick={() => settle(true)}
                className="clay-press px-4 py-2 text-sm font-bold text-white"
                style={{ background: "var(--bad-acc)", cursor: "pointer" }}
              >
                {req.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
