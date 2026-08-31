import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import "./workspace.css";
import { I18nProvider } from "@/components/i18n-provider";
import { chatGPTSignInPath, getChatGPTUser } from "./chatgpt-auth";

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

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const mustSignIn =
    process.env.NODE_ENV === "production" && !(await getChatGPTUser());
  return (
    <html lang="en">
      <body className={mono.variable}>
        {mustSignIn ? (
          <main className="wiki-shell bootstrap-shell-root">
            <section className="bootstrap-stage">
              <div className="bootstrap-card auth-card">
                <p className="eyebrow">PRIVATE WIKI · CHATGPT SIGN-IN</p>
                <h1>Sign in to open your wiki</h1>
                <p>
                  ChatGPT sign-in is required. Your account opens or creates its
                  own private Liminal Wiki workspace.
                </p>
                <div className="bootstrap-actions">
                  <a
                    className="save-button"
                    href={chatGPTSignInPath("/")}
                    target="_top"
                  >
                    Sign in with ChatGPT
                  </a>
                </div>
              </div>
            </section>
          </main>
        ) : (
          <I18nProvider>{children}</I18nProvider>
        )}
      </body>
    </html>
  );
}
