import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import "./upstream-workspace.css";

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://liminal-wiki-webmcp.epinfomax.chatgpt.site"),
  title: "Liminal Wiki — WebMCP Native Knowledge",
  description:
    "사람과 에이전트가 같은 데이터, 권한, 리비전을 공유하는 WebMCP 네이티브 지식 작업공간",
  openGraph: {
    title: "Liminal Wiki",
    description: "사람과 에이전트가 함께 편집하는 지식 공간",
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
    description: "사람과 에이전트가 함께 편집하는 지식 공간",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className={mono.variable}>{children}</body>
    </html>
  );
}
