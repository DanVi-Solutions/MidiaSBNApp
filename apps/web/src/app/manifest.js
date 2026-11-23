export default function manifest() {
  return {
    name: "Mídia Sobrenatural",
    short_name: "Mídia SBN",
    description: "Escalas da equipe Mídia Sobrenatural.",
    start_url: "/schedule",
    scope: "/",
    display: "standalone",
    background_color: "#1a1a1f",
    theme_color: "#1a1a1f",
    lang: "pt-BR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
