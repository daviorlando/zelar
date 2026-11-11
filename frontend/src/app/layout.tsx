import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import { CHAVE_TEMA, CHAVE_TEMA_ANTIGA } from "@/lib/tema-chave";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "sans-serif"],
});

// Codec Pro nos títulos e sobretítulos, como no SIG Agro IA.
const codecBold = localFont({ src: "./fonts/CodecPro-Bold.woff2", variable: "--font-codec-bold", weight: "700", display: "swap" });
const codecLight = localFont({ src: "./fonts/CodecPro-Light.woff2", variable: "--font-codec-light", weight: "300", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Zelar", template: "%s · Zelar" },
  description: "Painel do gestor de manutenção",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#050b1a" },
    { media: "(prefers-color-scheme: light)", color: "#f3f6fb" },
  ],
};

/* Tema antes da primeira pintura: a escolha salva vence; sem ela, segue o sistema. */
const semLampejo = `try{var a=localStorage.getItem("${CHAVE_TEMA_ANTIGA}");if(a!==null){localStorage.setItem("${CHAVE_TEMA}",a);localStorage.removeItem("${CHAVE_TEMA_ANTIGA}")}var t=localStorage.getItem("${CHAVE_TEMA}");if(t==="claro"||(t!=="escuro"&&window.matchMedia("(prefers-color-scheme: light)").matches))document.documentElement.classList.add("light")}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${codecBold.variable} ${codecLight.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: semLampejo }} />
      </head>
      <body className="min-h-dvh antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
