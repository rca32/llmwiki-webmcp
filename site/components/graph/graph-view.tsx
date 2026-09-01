"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import {
  SigmaContainer,
  useLoadGraph,
  useRegisterEvents,
  useSetSettings,
  useSigma,
} from "@react-sigma/core";
import type { NodeHoverDrawingFunction } from "sigma/rendering";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  EyeOff,
  FileText,
  Layers,
  Lightbulb,
  Maximize,
  Network,
  RefreshCw,
  Search,
  Tag,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { MarkdownPreview } from "@/app/markdown-preview";
import { useI18n, type TranslationKey } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  buildGraphTopology,
  detectGraphCommunities,
  filterGraph,
  getNodeConnections,
  type WikiGraph,
} from "@/lib/graph-exploration";

export type { WikiGraph } from "@/lib/graph-exploration";

type ColorMode = "type" | "community";
type HoverState = { node: string; neighbors: Set<string> } | null;
type GraphScope = "global" | "local";
type ContextMenuState = { nodeId: string; x: number; y: number } | null;
type PreviewPage = {
  id: string;
  title: string;
  page_type: string;
  markdown: string;
  version: number;
  path: string;
};

const NODE_TYPE_COLORS: Record<string, string> = {
  entity: "#60a5fa",
  concept: "#c084fc",
  source: "#fb923c",
  query: "#4ade80",
  synthesis: "#f87171",
  overview: "#facc15",
  comparison: "#2dd4bf",
  finding: "#a855f7",
  thesis: "#f43f5e",
  methodology: "#14b8a6",
  note: "#94a3b8",
  other: "#94a3b8",
};

const CUSTOM_NODE_COLORS = [
  "#38bdf8",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#a78bfa",
  "#22d3ee",
  "#f97316",
  "#84cc16",
];
const COMMUNITY_COLORS = [
  "#60a5fa",
  "#4ade80",
  "#fb923c",
  "#c084fc",
  "#f87171",
  "#2dd4bf",
  "#facc15",
  "#f472b6",
];
const TYPE_LABELS: Record<string, string> = {
  entity: "Entity",
  concept: "Concept",
  source: "Source",
  query: "Query",
  synthesis: "Synthesis",
  overview: "Overview",
  comparison: "Comparison",
  finding: "Finding",
  thesis: "Thesis",
  methodology: "Methodology",
  note: "Note",
  other: "Other",
};
const TYPE_KEYS: Record<string, TranslationKey> = {
  entity: "type.entity",
  concept: "type.concept",
  source: "type.source",
  query: "type.query",
  synthesis: "type.synthesis",
  overview: "type.overview",
  comparison: "type.comparison",
  note: "type.note",
  folder: "type.folder",
  other: "type.other",
};
const BASE_NODE_SIZE = 8;
const MAX_NODE_SIZE = 28;
const EMPTY_GRAPH: WikiGraph = { nodes: [], edges: [], truncated: false };

function nodeColor(type: string): string {
  if (NODE_TYPE_COLORS[type]) return NODE_TYPE_COLORS[type];
  let hash = 0;
  for (const char of type) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return CUSTOM_NODE_COLORS[hash % CUSTOM_NODE_COLORS.length] ?? "#94a3b8";
}

function stringHash(value: string): number {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nodeSize(linkCount: number, maxLinks: number, nodeCount: number) {
  const ratio = maxLinks === 0 ? 0 : linkCount / maxLinks;
  const density =
    nodeCount <= 150 ? 1 : Math.max(0.35, Math.sqrt(150 / nodeCount));
  return (
    (BASE_NODE_SIZE + Math.sqrt(ratio) * (MAX_NODE_SIZE - BASE_NODE_SIZE)) *
    density
  );
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - safeRadius,
    y + height,
  );
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function createGraphNodeHoverRenderer(
  isDark: boolean,
): NodeHoverDrawingFunction {
  return (context, data, settings) => {
    const label = typeof data.label === "string" ? data.label : "";
    const labelSize = settings.labelSize;
    const nodeRadius = Math.max(data.size, labelSize / 2) + 3;
    context.save();
    context.shadowOffsetY = 2;
    context.shadowBlur = 10;
    context.shadowColor = isDark ? "rgba(2,6,23,.55)" : "rgba(15,23,42,.18)";
    context.fillStyle = isDark ? "rgba(15,23,42,.96)" : "rgba(255,255,255,.98)";
    context.strokeStyle = isDark
      ? "rgba(148,163,184,.38)"
      : "rgba(15,23,42,.14)";
    context.lineWidth = 1;
    context.beginPath();
    context.arc(data.x, data.y, nodeRadius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    if (label) {
      context.font = `${settings.labelWeight} ${labelSize}px ${settings.labelFont}`;
      const paddingX = 8;
      const boxWidth = Math.ceil(
        context.measureText(label).width + paddingX * 2,
      );
      const boxHeight = Math.ceil(labelSize + 8);
      const boxX = data.x + nodeRadius + 6;
      const boxY = data.y - boxHeight / 2;
      drawRoundedRect(context, boxX, boxY, boxWidth, boxHeight, 5);
      context.fill();
      context.stroke();
      context.shadowBlur = 0;
      context.fillStyle = isDark ? "#f8fafc" : "#0f172a";
      context.fillText(label, boxX + paddingX, data.y + labelSize / 3);
    }
    context.restore();
  };
}

function useResolvedDarkMode() {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setIsDark(root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

function GraphLoader({
  graphData,
  colorMode,
  communityByNode,
  showArrows,
}: {
  graphData: WikiGraph;
  colorMode: ColorMode;
  communityByNode: Map<string, number>;
  showArrows: boolean;
}) {
  const loadGraph = useLoadGraph();
  useEffect(() => {
    const graph = new Graph();
    const degree = new Map(graphData.nodes.map((node) => [node.id, 0]));
    for (const edge of graphData.edges) {
      degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    }
    const maxLinks = Math.max(...degree.values(), 1);
    const nodeCount = graphData.nodes.length;
    graphData.nodes.forEach((node, index) => {
      const angle = (index / Math.max(nodeCount, 1)) * Math.PI * 2;
      const ring = Math.max(1, Math.ceil(Math.sqrt(nodeCount)));
      const hash = stringHash(node.id);
      const community = communityByNode.get(node.id) ?? -1;
      graph.addNode(node.id, {
        x: Math.cos(angle) * ring + ((hash % 31) - 15) / 50,
        y: Math.sin(angle) * ring + (((hash >>> 5) % 31) - 15) / 50,
        size: nodeSize(degree.get(node.id) ?? 0, maxLinks, nodeCount),
        color:
          colorMode === "community"
            ? community >= 0
              ? COMMUNITY_COLORS[community % COMMUNITY_COLORS.length]
              : "#94a3b8"
            : nodeColor(node.page_type),
        label: node.title,
        nodeType: node.page_type,
        community,
      });
    });
    graphData.edges.forEach((edge, index) => {
      if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) return;
      graph.addEdgeWithKey(
        `${edge.source}->${edge.target}:${index}`,
        edge.source,
        edge.target,
        {
          color: "rgba(100,116,139,.34)",
          size: 1.2,
          type: showArrows ? "arrow" : "line",
          label: edge.target_text,
          sourceNode: edge.source,
          targetNode: edge.target,
        },
      );
    });
    if (graph.order > 1 && graph.size > 0) {
      const settings = forceAtlas2.inferSettings(graph);
      forceAtlas2.assign(graph, {
        iterations: graph.order > 600 ? 45 : graph.order > 200 ? 70 : 120,
        settings: {
          ...settings,
          gravity: 1,
          scalingRatio: graph.order > 400 ? 3 : 2,
          strongGravityMode: true,
          barnesHutOptimize: graph.order > 50,
        },
      });
    }
    loadGraph(graph);
  }, [colorMode, communityByNode, graphData, loadGraph, showArrows]);
  return null;
}

function GraphRenderSettings({
  focusState,
  isDark,
  showEdgeLabels,
}: {
  focusState: HoverState;
  isDark: boolean;
  showEdgeLabels: boolean;
}) {
  const sigma = useSigma();
  const setSettings = useSetSettings();
  useEffect(() => {
    setSettings({
      hideEdgesOnMove: true,
      hideLabelsOnMove: true,
      labelColor: { color: isDark ? "#f8fafc" : "#1e293b" },
      labelDensity: 1,
      labelRenderedSizeThreshold: 5,
      labelFont: "Geist Variable",
      labelWeight: "600",
      renderEdgeLabels: showEdgeLabels,
      defaultDrawNodeHover: createGraphNodeHoverRenderer(isDark),
      nodeReducer: (node, attrs) => {
        if (!focusState) return attrs;
        if (focusState.node === node) {
          return {
            ...attrs,
            size: (attrs.size ?? BASE_NODE_SIZE) * 1.4,
            forceLabel: true,
            highlighted: true,
            zIndex: 10,
          };
        }
        if (focusState.neighbors.has(node))
          return { ...attrs, forceLabel: true };
        return {
          ...attrs,
          color: isDark ? "#334155" : "#d7dee8",
          label: "",
          size: (attrs.size ?? BASE_NODE_SIZE) * 0.62,
        };
      },
      edgeReducer: (_edge, attrs) => {
        if (!focusState) return attrs;
        const connected =
          attrs.sourceNode === focusState.node ||
          attrs.targetNode === focusState.node;
        return connected
          ? {
              ...attrs,
              color: isDark ? "#38bdf8" : "#1e293b",
              size: 2,
              forceLabel: showEdgeLabels,
            }
          : { ...attrs, color: "rgba(148,163,184,.14)", size: 0.3 };
      },
    });
    sigma.refresh();
  }, [focusState, isDark, setSettings, showEdgeLabels, sigma]);
  return null;
}

function EventHandler({
  onNodeClick,
  onNodeDoubleClick,
  onNodeRightClick,
  onStageClick,
  onHoverChange,
}: {
  onNodeClick: (nodeId: string) => void;
  onNodeDoubleClick: (nodeId: string) => void;
  onNodeRightClick: (nodeId: string, x: number, y: number) => void;
  onStageClick: () => void;
  onHoverChange: (state: HoverState) => void;
}) {
  const registerEvents = useRegisterEvents();
  const sigma = useSigma();
  useEffect(() => {
    registerEvents({
      clickNode: ({ node }) => onNodeClick(node),
      doubleClickNode: ({ node, event }) => {
        event.preventSigmaDefault();
        onNodeDoubleClick(node);
      },
      rightClickNode: ({ node, event }) => {
        event.preventSigmaDefault();
        event.original.preventDefault();
        onNodeRightClick(node, event.x, event.y);
      },
      clickStage: onStageClick,
      enterNode: ({ node }) => {
        sigma.getContainer().style.cursor = "pointer";
        onHoverChange({
          node,
          neighbors: new Set(sigma.getGraph().neighbors(node)),
        });
      },
      leaveNode: () => {
        sigma.getContainer().style.cursor = "default";
        onHoverChange(null);
      },
    });
  }, [
    onHoverChange,
    onNodeClick,
    onNodeDoubleClick,
    onNodeRightClick,
    onStageClick,
    registerEvents,
    sigma,
  ]);
  return null;
}

function ZoomControls() {
  const sigma = useSigma();
  const { t } = useI18n();
  return (
    <div className="graph-zoom-controls" aria-label={t("graph.zoomControls")}>
      <Button
        variant="outline"
        size="icon-xs"
        aria-label={t("graph.zoomIn")}
        onClick={() => sigma.getCamera().animatedZoom({ duration: 200 })}
      >
        <ZoomIn />
      </Button>
      <Button
        variant="outline"
        size="icon-xs"
        aria-label={t("graph.zoomOut")}
        onClick={() => sigma.getCamera().animatedUnzoom({ duration: 200 })}
      >
        <ZoomOut />
      </Button>
      <Button
        variant="outline"
        size="icon-xs"
        aria-label={t("graph.fit")}
        onClick={() => sigma.getCamera().animatedReset({ duration: 300 })}
      >
        <Maximize />
      </Button>
    </div>
  );
}

export function GraphView({
  graph,
  loading,
  activePageId,
  onRefresh,
  onOpenPage,
}: {
  graph: WikiGraph | null;
  loading: boolean;
  activePageId: string | null;
  onRefresh: () => void;
  onOpenPage: (pageId: string) => void;
}) {
  const { t } = useI18n();
  const typeLabel = (type: string) =>
    TYPE_KEYS[type] ? t(TYPE_KEYS[type]) : (TYPE_LABELS[type] ?? type);
  const graphData = useMemo(() => graph ?? EMPTY_GRAPH, [graph]);
  const [colorMode, setColorMode] = useState<ColorMode>("type");
  const [scope, setScope] = useState<GraphScope>("global");
  const [localDepth, setLocalDepth] = useState<1 | 2 | 3>(1);
  const [query, setQuery] = useState("");
  const [pageType, setPageType] = useState("all");
  const [includeOrphans, setIncludeOrphans] = useState(true);
  const [showArrows, setShowArrows] = useState(true);
  const [showEdgeLabels, setShowEdgeLabels] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoverState, setHoverState] = useState<HoverState>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [preview, setPreview] = useState<PreviewPage | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const requestRef = useRef(0);
  const isDark = useResolvedDarkMode();

  const topology = useMemo(() => buildGraphTopology(graphData), [graphData]);
  const communityByNode = useMemo(
    () => detectGraphCommunities(graphData),
    [graphData],
  );
  const localRootId = selectedNodeId ?? activePageId;
  const visibleGraph = useMemo(
    () =>
      filterGraph(graphData, topology, {
        query,
        pageType,
        includeOrphans,
        scope,
        rootId: localRootId,
        depth: localDepth,
      }),
    [
      graphData,
      includeOrphans,
      localDepth,
      localRootId,
      pageType,
      query,
      scope,
      topology,
    ],
  );
  const nodeById = useMemo(
    () => new Map(graphData.nodes.map((node) => [node.id, node])),
    [graphData.nodes],
  );

  useEffect(() => {
    if (selectedNodeId && !nodeById.has(selectedNodeId)) {
      const timeout = window.setTimeout(() => {
        setSelectedNodeId(null);
        setPreview(null);
      }, 0);
      return () => window.clearTimeout(timeout);
    }
  }, [nodeById, selectedNodeId]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const node of visibleGraph.nodes) {
      const type = node.page_type || "other";
      counts[type] = (counts[type] ?? 0) + 1;
    }
    return counts;
  }, [visibleGraph.nodes]);

  const pageTypes = useMemo(
    () =>
      [
        ...new Set(graphData.nodes.map((node) => node.page_type || "other")),
      ].sort(),
    [graphData.nodes],
  );

  const communityCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const node of visibleGraph.nodes) {
      const community = communityByNode.get(node.id) ?? -1;
      counts.set(community, (counts.get(community) ?? 0) + 1);
    }
    return [...counts.entries()].sort((left, right) => {
      if (left[0] === -1) return 1;
      if (right[0] === -1) return -1;
      return left[0] - right[0];
    });
  }, [communityByNode, visibleGraph.nodes]);

  const isolatedNodes = useMemo(() => {
    return graphData.nodes.filter(
      (node) => (topology.degree.get(node.id) ?? 0) === 0,
    );
  }, [graphData.nodes, topology.degree]);

  const selectedFocus = useMemo<HoverState>(() => {
    if (!selectedNodeId || !topology.adjacency.has(selectedNodeId)) return null;
    return {
      node: selectedNodeId,
      neighbors: topology.adjacency.get(selectedNodeId) ?? new Set<string>(),
    };
  }, [selectedNodeId, topology.adjacency]);
  const focusState = hoverState ?? selectedFocus;

  const previewConnections = useMemo(
    () => (preview ? getNodeConnections(graphData, preview.id) : []),
    [graphData, preview],
  );

  const openPreview = useCallback(
    async (pageId: string) => {
      const requestId = ++requestRef.current;
      const snapshot = graphData.nodes.find((node) => node.id === pageId);
      if (snapshot) setPreview({ ...snapshot, markdown: "", path: "" });
      setPreviewLoading(true);
      try {
        const response = await fetch(`/api/pages/${pageId}`, {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        const envelope = (await response.json()) as {
          ok: boolean;
          data?: { page?: PreviewPage };
        };
        if (!response.ok || !envelope.ok || !envelope.data?.page)
          throw new Error("preview unavailable");
        if (requestId === requestRef.current) setPreview(envelope.data.page);
      } catch {
        // Keep the immediate graph snapshot visible if detail loading fails.
      } finally {
        if (requestId === requestRef.current) setPreviewLoading(false);
      }
    },
    [graphData.nodes],
  );

  const selectNode = useCallback(
    (pageId: string) => {
      setSelectedNodeId(pageId);
      setContextMenu(null);
      void openPreview(pageId);
    },
    [openPreview],
  );

  const showNearbyPages = useCallback((pageId: string) => {
    setSelectedNodeId(pageId);
    setScope("local");
    setContextMenu(null);
  }, []);

  const closePreview = useCallback(() => {
    requestRef.current += 1;
    setPreview(null);
    setPreviewLoading(false);
  }, []);

  const openDocument = useCallback(
    (pageId: string) => {
      setContextMenu(null);
      onOpenPage(pageId);
    },
    [onOpenPage],
  );

  const localRootTitle = localRootId
    ? nodeById.get(localRootId)?.title
    : undefined;

  return (
    <section className="graph-view">
      <header className="graph-toolbar">
        <div className="graph-title">
          <Network />
          <strong>{t("graph.title")}</strong>
          <span>
            {t("graph.visiblePages", {
              visible: visibleGraph.nodes.length,
              total: graphData.nodes.length,
            })}
          </span>
          <span>{t("graph.links", { count: visibleGraph.edges.length })}</span>
        </div>
        <nav aria-label={t("graph.tools")}>
          <button
            type="button"
            className={scope === "global" ? "active" : ""}
            onClick={() => setScope("global")}
          >
            <Network />
            <span>{t("graph.global")}</span>
          </button>
          <button
            type="button"
            className={scope === "local" ? "active" : ""}
            onClick={() => setScope("local")}
            disabled={!localRootId}
            title={!localRootId ? t("graph.selectLocalRoot") : undefined}
          >
            <Layers />
            <span>{t("graph.local")}</span>
          </button>
          <button
            type="button"
            className={colorMode === "type" ? "active" : ""}
            onClick={() => setColorMode("type")}
          >
            <Tag />
            <span>{t("graph.type")}</span>
          </button>
          <button
            type="button"
            className={colorMode === "community" ? "active" : ""}
            onClick={() => setColorMode("community")}
          >
            <Layers />
            <span>{t("graph.community")}</span>
          </button>
          <button
            type="button"
            className={showInsights ? "active" : ""}
            onClick={() => setShowInsights((value) => !value)}
          >
            <Lightbulb />
            <span>{t("graph.insights")}</span>
            <b>{isolatedNodes.length}</b>
          </button>
          <button
            type="button"
            className={loading ? "loading icon-only" : "icon-only"}
            onClick={onRefresh}
            disabled={loading}
            aria-label={loading ? t("graph.refreshing") : t("graph.refresh")}
          >
            <RefreshCw />
          </button>
        </nav>
      </header>

      <div className="graph-filterbar" aria-label={t("graph.filters")}>
        <label className="graph-search">
          <Search />
          <span className="sr-only">{t("graph.search")}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("graph.searchPlaceholder")}
          />
        </label>
        <label className="graph-filter-select">
          <span>{t("graph.pageType")}</span>
          <select
            value={pageType}
            onChange={(event) => setPageType(event.target.value)}
            aria-label={t("graph.pageType")}
          >
            <option value="all">{t("graph.allTypes")}</option>
            {pageTypes.map((type) => (
              <option key={type} value={type}>
                {typeLabel(type)}
              </option>
            ))}
          </select>
        </label>
        {scope === "local" && (
          <label className="graph-filter-select">
            <span>{t("graph.depth")}</span>
            <select
              value={localDepth}
              onChange={(event) =>
                setLocalDepth(Number(event.target.value) as 1 | 2 | 3)
              }
              aria-label={t("graph.depth")}
            >
              {[1, 2, 3].map((depth) => (
                <option key={depth} value={depth}>
                  {depth}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className={includeOrphans ? "active" : ""}
          aria-pressed={includeOrphans}
          onClick={() => setIncludeOrphans((value) => !value)}
        >
          <EyeOff />
          <span>{t("graph.unlinked")}</span>
        </button>
        <button
          type="button"
          className={showArrows ? "active" : ""}
          aria-pressed={showArrows}
          onClick={() => setShowArrows((value) => !value)}
        >
          <ArrowRight />
          <span>{t("graph.arrows")}</span>
        </button>
        <button
          type="button"
          className={showEdgeLabels ? "active" : ""}
          aria-pressed={showEdgeLabels}
          onClick={() => setShowEdgeLabels((value) => !value)}
        >
          <Tag />
          <span>{t("graph.linkLabels")}</span>
        </button>
        {scope === "local" && localRootTitle && (
          <span className="graph-local-root" title={localRootTitle}>
            {t("graph.centeredOn", { title: localRootTitle })}
          </span>
        )}
        {selectedNodeId && (
          <button
            type="button"
            className="graph-clear-selection"
            onClick={() => {
              setSelectedNodeId(null);
              setHoverState(null);
              setContextMenu(null);
              if (scope === "local" && !activePageId) setScope("global");
            }}
          >
            <X />
            <span>{t("graph.clearSelection")}</span>
          </button>
        )}
      </div>

      <div className="graph-body">
        <div
          className="graph-canvas"
          data-node-count={visibleGraph.nodes.length}
        >
          {visibleGraph.nodes.length ? (
            <SigmaContainer
              className="sigma-container"
              settings={{
                allowInvalidContainer: true,
                defaultNodeType: "circle",
                defaultEdgeType: "line",
                labelFont: "Geist Variable",
                labelWeight: "600",
                labelSize: 12,
                zIndex: true,
              }}
            >
              <GraphLoader
                graphData={visibleGraph}
                colorMode={colorMode}
                communityByNode={communityByNode}
                showArrows={showArrows}
              />
              <GraphRenderSettings
                focusState={focusState}
                isDark={isDark}
                showEdgeLabels={showEdgeLabels}
              />
              <EventHandler
                onNodeClick={selectNode}
                onNodeDoubleClick={openDocument}
                onNodeRightClick={(nodeId, x, y) => {
                  setSelectedNodeId(nodeId);
                  void openPreview(nodeId);
                  setContextMenu({ nodeId, x, y });
                }}
                onStageClick={() => setContextMenu(null)}
                onHoverChange={setHoverState}
              />
              <ZoomControls />
            </SigmaContainer>
          ) : (
            <div className="graph-empty">
              <Network />
              <strong>
                {loading
                  ? t("graph.loading")
                  : graphData.nodes.length
                    ? t("graph.noMatches")
                    : t("graph.empty")}
              </strong>
            </div>
          )}

          {contextMenu && (
            <div
              className="graph-context-menu"
              role="menu"
              style={{ left: contextMenu.x + 8, top: contextMenu.y + 8 }}
            >
              <strong>
                {nodeById.get(contextMenu.nodeId)?.title ??
                  t("graph.selectedPage")}
              </strong>
              <button
                type="button"
                role="menuitem"
                onClick={() => selectNode(contextMenu.nodeId)}
              >
                {t("graph.previewAction")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => showNearbyPages(contextMenu.nodeId)}
              >
                {t("graph.localFromHere")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => openDocument(contextMenu.nodeId)}
              >
                {t("graph.openDocument")}
              </button>
            </div>
          )}

          <div
            className="graph-accessible-nodes"
            aria-label={t("graph.pageList")}
          >
            {visibleGraph.nodes.map((node) => (
              <button
                key={node.id}
                type="button"
                className="graph-accessible-node"
                data-graph-node-id={node.id}
                aria-label={t("graph.node", { title: node.title })}
                aria-pressed={selectedNodeId === node.id}
                onClick={() => selectNode(node.id)}
                onDoubleClick={() => openDocument(node.id)}
              >
                {node.title}
              </button>
            ))}
          </div>

          <aside className="graph-legend" aria-label={t("graph.nodeTypes")}>
            <strong>
              {colorMode === "type"
                ? t("graph.nodeTypes")
                : t("graph.communities")}
            </strong>
            {colorMode === "type"
              ? Object.entries(typeCounts).map(([type, count]) => (
                  <div key={type}>
                    <i style={{ backgroundColor: nodeColor(type) }} />
                    <span>{typeLabel(type)}</span>
                    <b>{count}</b>
                  </div>
                ))
              : communityCounts.map(([community, count]) => (
                  <div key={community}>
                    <i
                      style={{
                        backgroundColor:
                          community < 0
                            ? "#94a3b8"
                            : COMMUNITY_COLORS[
                                community % COMMUNITY_COLORS.length
                              ],
                      }}
                    />
                    <span>
                      {community < 0
                        ? t("graph.unlinked")
                        : `${t("graph.community")} ${community + 1}`}
                    </span>
                    <b>{count}</b>
                  </div>
                ))}
          </aside>
        </div>

        {showInsights && !preview && (
          <aside className="graph-insights-panel">
            <header>
              <div>
                <Lightbulb />
                <strong>{t("graph.insights")}</strong>
              </div>
              <button
                type="button"
                onClick={() => setShowInsights(false)}
                aria-label={t("graph.closeInsights")}
              >
                <X />
              </button>
            </header>
            <section>
              <span>{t("graph.summary")}</span>
              <strong>
                {t("graph.pages", { count: graphData.nodes.length })} ·{" "}
                {t("graph.links", { count: graphData.edges.length })}
              </strong>
              <p>{t("graph.isolated", { count: isolatedNodes.length })}</p>
            </section>
            {isolatedNodes.length > 0 && (
              <section>
                <span>{t("graph.gaps")}</span>
                {isolatedNodes.slice(0, 8).map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => selectNode(node.id)}
                  >
                    <EyeOff />
                    <span>{node.title}</span>
                  </button>
                ))}
              </section>
            )}
          </aside>
        )}

        {preview && (
          <aside
            className="graph-preview-panel"
            aria-label={t("graph.preview")}
          >
            <header>
              <div className="graph-preview-heading">
                <span title={preview.path || preview.title}>
                  {preview.title}
                </span>
                <small>
                  {typeLabel(preview.page_type)} ·{" "}
                  {t("graph.connections", {
                    count: previewConnections.length,
                  })}
                </small>
              </div>
              <button
                type="button"
                onClick={closePreview}
                aria-label={t("graph.closePreview")}
              >
                <X />
              </button>
            </header>
            <div className="graph-preview-scroll">
              <section className="graph-connections">
                <header>
                  <strong>{t("graph.connectedPages")}</strong>
                  <span>{previewConnections.length}</span>
                </header>
                {previewConnections.length ? (
                  <div>
                    {previewConnections
                      .slice(0, 16)
                      .map((connection, index) => {
                        const target = nodeById.get(connection.nodeId);
                        if (!target) return null;
                        return (
                          <button
                            key={`${connection.direction}:${connection.nodeId}:${index}`}
                            type="button"
                            onClick={() => selectNode(connection.nodeId)}
                            title={connection.label}
                          >
                            {connection.direction === "incoming" ? (
                              <ArrowDownLeft />
                            ) : (
                              <ArrowUpRight />
                            )}
                            <span>{target.title}</span>
                            <small>
                              {connection.direction === "incoming"
                                ? t("graph.incoming")
                                : t("graph.outgoing")}
                            </small>
                          </button>
                        );
                      })}
                  </div>
                ) : (
                  <p>{t("graph.noConnections")}</p>
                )}
              </section>
              {previewLoading && !preview.markdown ? (
                <div className="graph-preview-loading">
                  {t("graph.loadingDocument")}
                </div>
              ) : preview.markdown ? (
                <MarkdownPreview
                  value={preview.markdown}
                  onWikiLink={(title) => {
                    const target = graphData.nodes.find(
                      (node) =>
                        node.title.toLocaleLowerCase() ===
                        title.toLocaleLowerCase(),
                    );
                    if (target) selectNode(target.id);
                  }}
                />
              ) : (
                <div className="graph-preview-loading">
                  {t("graph.previewFailed")}
                </div>
              )}
            </div>
            <footer>
              <span>
                <FileText /> v{preview.version}
              </span>
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => showNearbyPages(preview.id)}
                >
                  {t("graph.localFromHere")}
                </Button>
                <Button size="sm" onClick={() => openDocument(preview.id)}>
                  {t("graph.openDocument")}
                </Button>
              </div>
            </footer>
          </aside>
        )}
      </div>

      {graphData.truncated && (
        <p className="graph-truncated">{t("graph.truncated")}</p>
      )}
    </section>
  );
}
