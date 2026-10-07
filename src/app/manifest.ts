import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "TALEVO — ผู้ช่วยจัดการการเรียน",
    short_name: "TALEVO",
    description: "จัดการตารางเรียน งาน และการแจ้งเตือนในชีวิตมหาวิทยาลัย",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8f6ff",
    theme_color: "#6843ee",
    orientation: "any",
    categories: ["education", "productivity"],
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
