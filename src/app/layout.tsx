import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vibe Fixer — security checks for AI-built applications",
  description: "Security checks for AI-built applications.",
};

export const viewport: Viewport = {
  // Both entries are required: without them the browser picks one theme's
  // chrome colour and keeps it, so the address bar clashes in the other.
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#08080a" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

/*
 * Applies the stored theme before first paint.
 *
 * This has to be a blocking inline script rather than an effect: React runs
 * after paint, so a user who chose light would otherwise see a full dark
 * frame flash first. It reads one key and sets one attribute — deliberately
 * the smallest thing that can run here.
 */
const THEME_INIT_SCRIPT = `
try {
  var t = localStorage.getItem("vibe-fixer-theme");
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
} catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-canvas font-sans text-fg">{children}</body>
    </html>
  );
}
