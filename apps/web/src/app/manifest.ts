import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Grit - Life Tracker",
    short_name: "Grit",
    description:
      "Gamified habit tracker. Do good, gain XP, level up. Avoid the bad.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f1efe9",
    theme_color: "#272d29",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
