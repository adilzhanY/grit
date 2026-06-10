"use client";

import { useState } from "react";
import Image from "next/image";
import { useUi, type View } from "@/lib/ui";
import { useStore } from "@/lib/store";
import { Icon } from "./Icon";
import { AccountButton } from "./Account";
import { DataBackupButton } from "./DataBackup";

const SMART: { view: View; label: string; icon: string; color: string }[] = [
  { view: "myday", label: "My Day", icon: "Sun", color: "var(--primary)" },
  {
    view: "important",
    label: "Important",
    icon: "Star",
    color: "var(--primary)",
  },
  {
    view: "planned",
    label: "Planned",
    icon: "CalendarDays",
    color: "var(--primary)",
  },
  {
    view: "dailylog",
    label: "Daily Log",
    icon: "NotebookPen",
    color: "var(--primary)",
  },
];

const GAMIFIED: { view: View; label: string; icon: string; color: string }[] = [
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

function NavItem({
  label,
  icon,
  color,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left font-semibold transition-colors"
      style={{
        background: active ? "var(--surface)" : "transparent",
        boxShadow: active ? "var(--clay-sm)" : "none",
        color: active ? color : "var(--ink-soft)",
        cursor: "pointer",
      }}
    >
      <Icon name={icon} className="h-5 w-5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function Divider() {
  return <div className="my-2 h-px bg-black/10" />;
}

/** The shared sidebar body, used by both the desktop rail and the mobile drawer. */
function NavBody({ onNavigate }: { onNavigate?: () => void }) {
  const { view, setView } = useUi();
  const { lists, addList, settings, setSoundsEnabled } = useStore();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const go = (v: View) => {
    setView(v);
    onNavigate?.();
  };

  const createList = async () => {
    const n = name.trim();
    setName("");
    setCreating(false);
    if (!n) return;
    const list = await addList(n);
    setView(`list:${list.id}`);
    onNavigate?.();
  };

  return (
    <>
      <div className="mb-4 flex items-center px-2">
        <Image
          src="/logo.png"
          alt="grit"
          width={546}
          height={266}
          priority
          className="h-20 w-auto"
        />
      </div>

      {SMART.map((it) => (
        <NavItem
          key={it.view}
          label={it.label}
          icon={it.icon}
          color={it.color}
          active={view === it.view}
          onClick={() => go(it.view)}
        />
      ))}

      <Divider />

      {GAMIFIED.map((it) => (
        <NavItem
          key={it.view}
          label={it.label}
          icon={it.icon}
          color={it.color}
          active={view === it.view}
          onClick={() => go(it.view)}
        />
      ))}

      <Divider />

      {lists.map((l) => (
        <NavItem
          key={l.id}
          label={l.name}
          icon="ListChecks"
          color="var(--primary)"
          active={view === `list:${l.id}`}
          onClick={() => go(`list:${l.id}`)}
        />
      ))}

      {creating ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={createList}
          onKeyDown={(e) => {
            if (e.key === "Enter") createList();
            if (e.key === "Escape") {
              setName("");
              setCreating(false);
            }
          }}
          placeholder="List name"
          aria-label="New list name"
          className="rounded-2xl bg-transparent px-3 py-2.5 font-semibold outline-none placeholder:text-ink-faint"
          style={{ boxShadow: "var(--clay-sm)", background: "var(--surface)" }}
        />
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left font-semibold text-primary transition-colors hover:bg-black/5"
          style={{ cursor: "pointer" }}
        >
          <Icon name="Plus" className="h-5 w-5 shrink-0" />
          New list
        </button>
      )}

      <div className="mt-auto pt-2">
        <AccountButton />
      </div>

      <NavItem
        label="Analytics"
        icon="ChartColumn"
        color="var(--primary)"
        active={view === "analytics"}
        onClick={() => go("analytics")}
      />

      <DataBackupButton />

      <button
        onClick={() => setSoundsEnabled(!settings.soundsEnabled)}
        className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left font-semibold text-ink-soft transition-colors hover:bg-black/5"
        style={{ cursor: "pointer" }}
      >
        <Icon
          name={settings.soundsEnabled ? "Volume2" : "VolumeX"}
          className="h-5 w-5"
        />
        Sound {settings.soundsEnabled ? "on" : "off"}
      </button>
    </>
  );
}

export function Nav() {
  const { menuOpen, setMenuOpen } = useUi();
  const close = () => setMenuOpen(false);
  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden shrink-0 flex-col gap-2 p-4 md:flex md:w-60">
        <NavBody />
      </nav>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={close}
            aria-hidden
          />
          <nav
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col gap-2 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            style={{ background: "var(--page)" }}
          >
            <NavBody onNavigate={close} />
          </nav>
        </div>
      )}
    </>
  );
}
