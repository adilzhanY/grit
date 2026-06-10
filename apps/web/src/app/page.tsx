"use client";

import Image from "next/image";
import { UiProvider, useUi } from "@/lib/ui";
import { useStore } from "@/lib/store";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { Nav } from "@/components/Nav";
import { Views } from "@/components/Views";
import { Celebration } from "@/components/Celebration";
import { FocusBanner } from "@/components/FocusBanner";
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
          <Image
            src="/logo.png"
            alt="grit"
            width={546}
            height={266}
            priority
            className="h-10 w-auto"
          />
          <p className="font-bold text-ink-soft">…</p>
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
        <FocusBanner />
        <Celebration />
      </ConfirmProvider>
    </UiProvider>
  );
}

export default function Home() {
  return <Shell />;
}
