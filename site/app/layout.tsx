import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import "./workspace.css";
import { I18nProvider } from "@/components/i18n-provider";
import {
  LLM_WIKI_CORE_IDEA,
  LLM_WIKI_META_DESCRIPTION,
} from "@/lib/llm-wiki-core";
import { chatGPTSignInPath, getChatGPTUser } from "./chatgpt-auth";

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Liminal Wiki — Source-grounded, Compounding Knowledge",
  description: LLM_WIKI_META_DESCRIPTION,
  applicationName: "Liminal Wiki",
  openGraph: {
    title: "Liminal Wiki — Source-grounded, Compounding Knowledge",
    description: LLM_WIKI_META_DESCRIPTION,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Liminal Wiki source-grounded compounding knowledge workspace",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Liminal Wiki — Source-grounded, Compounding Knowledge",
    description: LLM_WIKI_META_DESCRIPTION,
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
                <p>{LLM_WIKI_CORE_IDEA}</p>
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
