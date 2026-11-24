import { Geist, Geist_Mono } from "next/font/google";
import { ToastProvider } from "@/components/ui/ToastProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: {
    default: "Mídia Sobrenatural",
    template: "%s | Mídia Sobrenatural",
  },
  description: "Sistema interno da equipe Mídia Sobrenatural.",
  applicationName: "Mídia Sobrenatural",
  appleWebApp: {
    capable: true,
    title: "Mídia SBN",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: { url: "/icon.svg", type: "image/svg+xml" },
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport = {
  themeColor: "#1a1a1f",
};

const THEME_INIT_SCRIPT = `(function(){var t="light";try{var p=window.localStorage.getItem("midia_sbn_theme_v1");if(p==="dark"||p==="light"){t=p;}else if(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches){t="dark";}}catch(e){}document.documentElement.dataset.theme=t;})();`;

export default function RootLayout({ children }) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
