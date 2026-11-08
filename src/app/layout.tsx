import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Solo Kanban",
    template: "%s · Solo Kanban",
  },
  description: "A developer project board built with Next.js and @dxsolo/ui",
  applicationName: "Solo Kanban",
  appleWebApp: {
    capable: true,
    title: "Kanban",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  formatDetection: {
    telephone: false,
  },
  // Next emits only the standard `mobile-web-app-capable`; iOS before 16.4
  // still needs the apple-prefixed tag to open home-screen launches standalone.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfc" },
    { media: "(prefers-color-scheme: dark)", color: "#070b14" },
  ],
};

// Inline script that runs before first paint: applies the theme and the
// desktop sidebar state (no flash), and keeps an early install prompt.
const headScript = `
  (function() {
    var root = document.documentElement;
    try {
      var t = localStorage.getItem('theme');
      if (t === 'dark' || (!t && matchMedia('(prefers-color-scheme:dark)').matches)) {
        root.classList.add('dark');
      }
      if (localStorage.getItem('sidebar') === 'collapsed') {
        root.setAttribute('data-sidebar', 'collapsed');
      }
    } catch (e) {}
    window.addEventListener('beforeinstallprompt', function(e) {
      e.preventDefault();
      window.__installPrompt = e;
    });
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: headScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider>{children}</ThemeProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
