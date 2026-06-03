"use client";

import { UiProvider, useUi } from "@/lib/ui";
import { useStore } from "@/lib/store";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { Nav } from "@/components/Nav";
import { Views } from "@/components/Views";
import { Celebration } from "@/components/Celebration";
import { XpHero } from "@/components/XpHero";
import { Icon } from "@/components/Icon";

function MobileBar() {
  const { settings, setSoundsEnabled } = useStore();
  const { setMenuOpen } = useUi();
  return (
    <header className="mb-4 flex items-center gap-3 md:hidden">
      <button
        onClick={() => setMenuOpen(true)}
        aria-label="Open menu"
        className="clay-press grid h-11 w-11 shrink-0 place-items-center"
        style={{ background: "var(--surface)", cursor: "pointer" }}
      >
        <Icon name="Menu" className="h-5 w-5" />
      </button>
      <div className="flex-1">
        <XpHero compact />
      </div>
      <button
        onClick={() => setSoundsEnabled(!settings.soundsEnabled)}
        aria-label={settings.soundsEnabled ? "Mute sounds" : "Unmute sounds"}
        className="clay-press grid h-11 w-11 shrink-0 place-items-center"
        style={{ background: "var(--surface)", cursor: "pointer" }}
      >
        <Icon
          name={settings.soundsEnabled ? "Volume2" : "VolumeX"}
          className="h-5 w-5"
        />
      </button>
    </header>
  );
}

function Shell() {
  const { ready } = useStore();

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="animate-pop flex flex-col items-center gap-3">
          <div
            className="grid h-16 w-16 place-items-center rounded-3xl text-2xl font-extrabold text-white"
            style={{ background: "linear-gradient(135deg,#14b8a6,#0b7a70)" }}
          >
            g
          </div>
          <p className="font-bold text-ink-soft">grit…</p>
        </div>
      </div>
    );
  }

  return (
    <UiProvider>
      <ConfirmProvider>
        <div className="flex min-h-screen w-full">
          <Nav />
          <main className="flex-1 px-4 pb-28 pt-4 md:px-6 md:pb-10 md:pt-6">
            <MobileBar />
            <Views />
          </main>
        </div>
        <Celebration />
      </ConfirmProvider>
    </UiProvider>
  );
}

export default function Home() {
  return <Shell />;
}
