"use client";

import { lazy, Suspense } from "react";
import { SiteTools } from "./site-tools";

const WorkspaceApp = lazy(() => import("./workspace-app"));

export default function Home() {
  return (
    <>
      <SiteTools />
      <Suspense
        fallback={
          <main className="wiki-shell bootstrap-shell-root">
            <div className="workspace-loading" role="status" aria-live="polite">
              Loading workspace…
            </div>
          </main>
        }
      >
        <WorkspaceApp />
      </Suspense>
    </>
  );
}
