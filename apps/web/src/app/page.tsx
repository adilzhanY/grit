"use client";

import Image from "next/image";
import { UiProvider, useUi } from "@/lib/ui";
import { useStore } from "@/lib/store";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { Nav } from "@/components/Nav";
import { Views } from "@/components/Views";
import { Celebration } from "@/components/Celebration";
import { Toast } from "@/components/Toast";
import { FocusBanner } from "@/components/FocusBanner";
import { FocusAlarm } from "@/components/FocusAlarm";
import { XpHero } from "@/components/XpHero";
import { ThemeSwitchIcon } from "@/components/ThemeSwitch";
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
      <ThemeSwitchIcon />
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
            width={552}
            height={552}
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
          {/* min-w-0: a flex child's min-width:auto would otherwise let wide
              content (e.g. the composer input's intrinsic size) stretch the
              page past the viewport on phones. */}
          <main className="min-w-0 flex-1 px-4 pb-28 pt-4 md:px-6 md:pb-10 md:pt-6">
            {/* Centered column: on wide screens content keeps comfortable side
                margins instead of stretching edge to edge (matches Focus). */}
            <div className="mx-auto w-full max-w-6xl">
              <MobileBar />
              <Views />
            </div>
          </main>
        </div>
        <FocusBanner />
        <FocusAlarm />
        <Celebration />
        <Toast />
      </ConfirmProvider>
    </UiProvider>
  );
}

export default function Home() {
  return <Shell />;
}
