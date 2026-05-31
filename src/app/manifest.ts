import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EBOSH — ебошь",
    short_name: "EBOSH",
    description:
      "Gamified habit tracker. Do good, gain XP, level up. Avoid the bad.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f1efe9",
    theme_color: "#0d9488",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
