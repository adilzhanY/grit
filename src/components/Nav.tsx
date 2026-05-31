"use client";

import { useUi, type View } from "@/lib/ui";
import { useStore } from "@/lib/store";
import { Icon } from "./Icon";

const ITEMS: { view: View; label: string; icon: string; color: string }[] = [
  { view: "myday", label: "My Day", icon: "Sun", color: "var(--primary)" },
  { view: "must", label: "Must", icon: "Flame", color: "var(--must-acc)" },
  { view: "bad", label: "Bad", icon: "Skull", color: "var(--bad-acc)" },
  { view: "cool", label: "Cool", icon: "Sparkles", color: "var(--cool-acc)" },
  {
    view: "impossible",
    label: "Impossible",
    icon: "Mountain",
    color: "var(--imp-acc)",
  },
];

export function Nav() {
  const { view, setView } = useUi();
  const { settings, setSoundsEnabled } = useStore();

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden shrink-0 flex-col gap-2 p-4 md:flex md:w-60">
        <div className="mb-4 flex items-center gap-2 px-2">
          <div
            className="grid h-10 w-10 place-items-center rounded-2xl text-lg font-extrabold text-white"
            style={{ background: "linear-gradient(135deg,#14b8a6,#0b7a70)" }}
          >
            Е
          </div>
          <span className="text-2xl font-extrabold tracking-tight">EBOSH</span>
        </div>

        {ITEMS.map((it) => {
          const active = view === it.view;
          return (
            <button
              key={it.view}
              onClick={() => setView(it.view)}
              aria-current={active ? "page" : undefined}
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left font-semibold transition-colors"
              style={{
                background: active ? "var(--surface)" : "transparent",
                boxShadow: active ? "var(--clay-sm)" : "none",
                color: active ? it.color : "var(--ink-soft)",
                cursor: "pointer",
              }}
            >
              <Icon name={it.icon} className="h-5 w-5" />
              {it.label}
            </button>
          );
        })}

        <button
          onClick={() => setSoundsEnabled(!settings.soundsEnabled)}
          className="mt-auto flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left font-semibold text-ink-soft transition-colors hover:bg-black/5"
          style={{ cursor: "pointer" }}
        >
          <Icon
            name={settings.soundsEnabled ? "Volume2" : "VolumeX"}
            className="h-5 w-5"
          />
          Sound {settings.soundsEnabled ? "on" : "off"}
        </button>
      </nav>

      {/* Mobile bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)] pt-1 md:hidden clay"
        style={{ borderRadius: "28px 28px 0 0", background: "var(--surface)" }}
      >
        {ITEMS.map((it) => {
          const active = view === it.view;
          return (
            <button
              key={it.view}
              onClick={() => setView(it.view)}
              aria-current={active ? "page" : undefined}
              aria-label={it.label}
              className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-bold"
              style={{ color: active ? it.color : "var(--ink-faint)", cursor: "pointer" }}
            >
              <span
                className="grid h-10 w-10 place-items-center rounded-2xl transition-all"
                style={{
                  background: active ? it.color : "transparent",
                  color: active ? "#fff" : "var(--ink-faint)",
                }}
              >
                <Icon name={it.icon} className="h-5 w-5" />
              </span>
              {it.label}
            </button>
          );
        })}
      </nav>
    </>
  );
}
