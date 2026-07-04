import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { AuthProvider } from "@/lib/auth";
import { ServiceWorker } from "@/components/ServiceWorker";

// SF Pro Display (Apple's system font), self-hosted and subset to Latin.
// Weights map to the app's scale: 400 / 500 / 600 / 700, plus Heavy for the
// "extrabold" (800) usages.
const sfPro = localFont({
  variable: "--font-sf",
  display: "swap",
  src: [
    { path: "./fonts/SFProDisplay-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/SFProDisplay-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/SFProDisplay-Semibold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/SFProDisplay-Bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/SFProDisplay-Heavy.woff2", weight: "800", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: "Grit - Life Tracker",
  description: "Gamified habit tracker. Do good, gain XP, level up. Avoid the bad.",
  applicationName: "Grit",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Grit",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#272d29",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sfPro.variable} h-full antialiased`}>
      <body className="min-h-full">
        <ServiceWorker />
        <AuthProvider>
          <StoreProvider>{children}</StoreProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
