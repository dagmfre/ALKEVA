import type { MetadataRoute } from "next";

/**
 * Installable app (Add to Home Screen) — also what lets an iPhone receive web
 * push at all: iOS delivers it only to installed web apps.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ALKEVA",
    short_name: "ALKEVA",
    description: "Digital precious metals for Ethiopia",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#060607",
    theme_color: "#060607",
    icons: [
      { src: "/brand/mark-128.png", sizes: "128x128", type: "image/png" },
      { src: "/brand/mark-256.png", sizes: "256x256", type: "image/png" },
      { src: "/brand/mark-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
