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
import { useI18n, type TranslationKey } from "@/components/i18n-provider";

export type WorkspaceView = "document" | "search" | "graph" | "operations";

const navItems: Array<{
  view: WorkspaceView;
  icon: typeof FileText;
  labelKey: TranslationKey;
}> = [
  { view: "document", icon: FileText, labelKey: "nav.document" },
  { view: "search", icon: Search, labelKey: "nav.search" },
  { view: "graph", icon: Network, labelKey: "nav.graph" },
  { view: "operations", icon: HardDrive, labelKey: "nav.operations" },
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
  const { t } = useI18n();
  return (
    <TooltipProvider delay={300}>
      <aside className="icon-sidebar" aria-label={t("nav.main")}>
        <div className="sidebar-wordmark" aria-label="Liminal Wiki">
          L
        </div>
        <nav className="sidebar-nav">
          {navItems.map(({ view, icon: Icon, labelKey }) => {
            const label = t(labelKey);
            return (
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
            );
          })}
        </nav>
        <Tooltip>
          <TooltipTrigger
            type="button"
            aria-label={
              leftPanelOpen ? t("nav.sidebarClose") : t("nav.sidebarOpen")
            }
            aria-pressed={!leftPanelOpen}
            className="sidebar-icon-button sidebar-toggle"
            onClick={onToggleLeftPanel}
          >
            {leftPanelOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
          </TooltipTrigger>
          <TooltipContent side="right">
            {leftPanelOpen ? t("nav.sidebarClose") : t("nav.sidebarOpen")}
          </TooltipContent>
        </Tooltip>
      </aside>
    </TooltipProvider>
  );
}
