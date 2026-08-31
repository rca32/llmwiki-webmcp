import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import "./workspace.css";
import { I18nProvider } from "@/components/i18n-provider";

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Liminal Wiki — WebMCP Native Knowledge",
  description:
    "A WebMCP-native knowledge workspace where people and agents share data, permissions, and revisions.",
  openGraph: {
    title: "Liminal Wiki",
    description: "A knowledge space edited together by people and agents.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Liminal Wiki WebMCP Native Knowledge Workspace",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Liminal Wiki",
    description: "A knowledge space edited together by people and agents.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={mono.variable}>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
