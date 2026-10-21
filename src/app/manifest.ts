import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tri Coach",
    short_name: "Tri Coach",
    description: "Personal training dashboard built on WHOOP data.",
    start_url: "/",
    display: "standalone",
    background_color: "#12161b",
    theme_color: "#12161b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
