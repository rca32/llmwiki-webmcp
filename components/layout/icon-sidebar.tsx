"use client";

import {
  FileText,
  HardDrive,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type WorkspaceView = "document" | "search" | "graph" | "operations";

const navItems: Array<{
  view: WorkspaceView;
  icon: typeof FileText;
  label: string;
}> = [
  { view: "document", icon: FileText, label: "문서" },
  { view: "search", icon: Search, label: "검색" },
  { view: "graph", icon: Network, label: "그래프" },
  { view: "operations", icon: HardDrive, label: "운영과 복구" },
];

export function IconSidebar({
  activeView,
  onViewChange,
  leftPanelOpen,
  onToggleLeftPanel,
}: {
  activeView: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
  leftPanelOpen: boolean;
  onToggleLeftPanel: () => void;
}) {
  return (
    <TooltipProvider delay={300}>
      <aside className="icon-sidebar" aria-label="주요 화면">
        <div className="sidebar-wordmark" aria-label="Liminal Wiki">
          L
        </div>
        <nav className="sidebar-nav">
          {navItems.map(({ view, icon: Icon, label }) => (
            <Tooltip key={view}>
              <TooltipTrigger
                type="button"
                aria-label={label}
                aria-current={activeView === view ? "page" : undefined}
                className={`sidebar-icon-button ${activeView === view ? "active" : ""}`}
                onClick={() => onViewChange(view)}
              >
                <Icon aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
          ))}
        </nav>
        <Tooltip>
          <TooltipTrigger
            type="button"
            aria-label={leftPanelOpen ? "사이드바 접기" : "사이드바 열기"}
            aria-pressed={!leftPanelOpen}
            className="sidebar-icon-button sidebar-toggle"
            onClick={onToggleLeftPanel}
          >
            {leftPanelOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
          </TooltipTrigger>
          <TooltipContent side="right">
            {leftPanelOpen ? "사이드바 접기" : "사이드바 열기"}
          </TooltipContent>
        </Tooltip>
      </aside>
    </TooltipProvider>
  );
}
