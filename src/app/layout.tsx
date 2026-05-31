import type { Metadata, Viewport } from "next";
import { Onest } from "next/font/google";
import "./globals.css";
import { StoreProvider } from "@/lib/store";

const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "EBOSH — ебошь",
  description: "Gamified habit tracker. Do good, gain XP, level up. Avoid the bad.",
  applicationName: "EBOSH",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "EBOSH",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0d9488",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${onest.variable} h-full antialiased`}>
      <body className="min-h-full">
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
