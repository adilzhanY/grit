"use client";

import { useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { useConfirm } from "./ConfirmDialog";
import { Icon } from "./Icon";

/** Export/import controls — lives in the backup modal. */
function BackupPanel() {
  const { exportBackup, importBackup } = useStore();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onExport = async () => {
    setStatus(null);
    await exportBackup();
    setStatus("Backup downloaded.");
  };

  const onPick = () => fileRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    const ok = await confirm({
      title: "Restore this backup?",
      message:
        "This replaces ALL current tasks, XP and logs on this device with the file's contents. Export a backup first if unsure.",
      confirmLabel: "Replace & restore",
    });
    if (!ok) return;
    setBusy(true);
    setStatus(null);
    try {
      const text = await file.text();
      const count = await importBackup(text);
      setStatus(`Restored ${count} item${count === 1 ? "" : "s"}.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={onExport}
        disabled={busy}
        className="clay-press flex items-center gap-3 px-4 py-3 text-left text-sm font-bold disabled:opacity-50"
        style={{ background: "var(--page-2)", cursor: "pointer" }}
      >
        <Icon name="Download" className="h-5 w-5 text-primary" />
        <span>
          Export backup
          <span className="block text-xs font-medium text-ink-soft">
            Download everything as a .json file
          </span>
        </span>
      </button>

      <button
        onClick={onPick}
        disabled={busy}
        className="clay-press flex items-center gap-3 px-4 py-3 text-left text-sm font-bold disabled:opacity-50"
        style={{ background: "var(--page-2)", cursor: "pointer" }}
      >
        <Icon name="Upload" className="h-5 w-5 text-primary" />
        <span>
          Import backup
          <span className="block text-xs font-medium text-ink-soft">
            Restore from a .json file (replaces all data)
          </span>
        </span>
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        onChange={onFile}
        className="hidden"
      />

      {status && (
        <p className="text-sm font-semibold text-ink-soft">{status}</p>
      )}
    </div>
  );
}

function BackupModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/40 px-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Backup & data"
      onClick={onClose}
    >
      <div
        className="animate-pop w-full max-w-sm p-6 clay"
        style={{ background: "var(--surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <Icon name="Database" className="h-5 w-5 text-primary" />
          <p className="text-lg font-extrabold tracking-tight">Backup &amp; data</p>
        </div>
        <p className="mb-4 text-sm font-medium text-ink-soft">
          Your data lives in this browser. Keep a backup so a cleared cache never
          wipes your progress.
        </p>
        <BackupPanel />
        <button
          onClick={onClose}
          className="mt-5 w-full text-center text-sm font-semibold text-ink-soft"
          style={{ cursor: "pointer" }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

export function DataBackupButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left font-semibold text-ink-soft transition-colors hover:bg-black/5"
        style={{ cursor: "pointer" }}
      >
        <Icon name="Database" className="h-5 w-5 shrink-0" />
        Backup &amp; data
      </button>
      {open && <BackupModal onClose={() => setOpen(false)} />}
    </>
  );
}
