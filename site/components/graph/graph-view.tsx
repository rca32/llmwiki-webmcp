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
  EyeOff,
  FileText,
  Layers,
  Lightbulb,
  Maximize,
  Network,
  RefreshCw,
  Tag,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { MarkdownPreview } from "@/app/markdown-preview";
import { Button } from "@/components/ui/button";

export type WikiGraph = {
  nodes: Array<{
    id: string;
    title: string;
    page_type: string;
    version: number;
  }>;
  edges: Array<{ source: string; target: string; target_text: string }>;
  truncated: boolean;
};

type ColorMode = "type" | "community";
type HoverState = { node: string; neighbors: Set<string> } | null;
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
}: {
  graphData: WikiGraph;
  colorMode: ColorMode;
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
      const community = hash % COMMUNITY_COLORS.length;
      graph.addNode(node.id, {
        x: Math.cos(angle) * ring + ((hash % 31) - 15) / 50,
        y: Math.sin(angle) * ring + (((hash >>> 5) % 31) - 15) / 50,
        size: nodeSize(degree.get(node.id) ?? 0, maxLinks, nodeCount),
        color:
          colorMode === "community"
            ? COMMUNITY_COLORS[community]
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
  }, [colorMode, graphData, loadGraph]);
  return null;
}

function GraphRenderSettings({
  hoverState,
  isDark,
}: {
  hoverState: HoverState;
  isDark: boolean;
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
      renderEdgeLabels: false,
      defaultDrawNodeHover: createGraphNodeHoverRenderer(isDark),
      nodeReducer: (node, attrs) => {
        if (!hoverState) return attrs;
        if (hoverState.node === node) {
          return {
            ...attrs,
            size: (attrs.size ?? BASE_NODE_SIZE) * 1.4,
            forceLabel: true,
            zIndex: 10,
          };
        }
        if (hoverState.neighbors.has(node))
          return { ...attrs, forceLabel: true };
        return {
          ...attrs,
          color: isDark ? "#334155" : "#d7dee8",
          label: "",
          size: (attrs.size ?? BASE_NODE_SIZE) * 0.62,
        };
      },
      edgeReducer: (_edge, attrs) => {
        if (!hoverState) return attrs;
        const connected =
          attrs.sourceNode === hoverState.node ||
          attrs.targetNode === hoverState.node;
        return connected
          ? { ...attrs, color: isDark ? "#38bdf8" : "#1e293b", size: 2 }
          : { ...attrs, color: "rgba(148,163,184,.14)", size: 0.3 };
      },
    });
    sigma.refresh();
  }, [hoverState, isDark, setSettings, sigma]);
  return null;
}

function EventHandler({
  onNodeClick,
  onHoverChange,
}: {
  onNodeClick: (nodeId: string) => void;
  onHoverChange: (state: HoverState) => void;
}) {
  const registerEvents = useRegisterEvents();
  const sigma = useSigma();
  useEffect(() => {
    registerEvents({
      clickNode: ({ node }) => onNodeClick(node),
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
  }, [onHoverChange, onNodeClick, registerEvents, sigma]);
  return null;
}

function ZoomControls() {
  const sigma = useSigma();
  return (
    <div className="graph-zoom-controls" aria-label="그래프 확대/축소">
      <Button
        variant="outline"
        size="icon-xs"
        aria-label="확대"
        onClick={() => sigma.getCamera().animatedZoom({ duration: 200 })}
      >
        <ZoomIn />
      </Button>
      <Button
        variant="outline"
        size="icon-xs"
        aria-label="축소"
        onClick={() => sigma.getCamera().animatedUnzoom({ duration: 200 })}
      >
        <ZoomOut />
      </Button>
      <Button
        variant="outline"
        size="icon-xs"
        aria-label="그래프 맞춤"
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
  onRefresh,
  onOpenPage,
}: {
  graph: WikiGraph | null;
  loading: boolean;
  onRefresh: () => void;
  onOpenPage: (pageId: string) => void;
}) {
  const graphData = useMemo(() => graph ?? EMPTY_GRAPH, [graph]);
  const [colorMode, setColorMode] = useState<ColorMode>("type");
  const [hoverState, setHoverState] = useState<HoverState>(null);
  const [preview, setPreview] = useState<PreviewPage | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const requestRef = useRef(0);
  const isDark = useResolvedDarkMode();

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const node of graphData.nodes) {
      const type = node.page_type || "other";
      counts[type] = (counts[type] ?? 0) + 1;
    }
    return counts;
  }, [graphData.nodes]);

  const isolatedNodes = useMemo(() => {
    const linked = new Set<string>();
    for (const edge of graphData.edges) {
      linked.add(edge.source);
      linked.add(edge.target);
    }
    return graphData.nodes.filter((node) => !linked.has(node.id));
  }, [graphData]);

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

  return (
    <section className="graph-view">
      <header className="graph-toolbar">
        <div className="graph-title">
          <Network />
          <strong>Knowledge Graph</strong>
          <span>{graphData.nodes.length} pages</span>
          <span>{graphData.edges.length} links</span>
        </div>
        <nav aria-label="그래프 도구">
          <button
            type="button"
            className={colorMode === "type" ? "active" : ""}
            onClick={() => setColorMode("type")}
          >
            <Tag />
            <span>Type</span>
          </button>
          <button
            type="button"
            className={colorMode === "community" ? "active" : ""}
            onClick={() => setColorMode("community")}
          >
            <Layers />
            <span>Community</span>
          </button>
          <button
            type="button"
            className={showInsights ? "active" : ""}
            onClick={() => setShowInsights((value) => !value)}
          >
            <Lightbulb />
            <span>Insights</span>
            <b>{isolatedNodes.length}</b>
          </button>
          <button
            type="button"
            className={loading ? "loading icon-only" : "icon-only"}
            onClick={onRefresh}
            disabled={loading}
            aria-label={loading ? "새로 고침 중" : "새로 고침"}
          >
            <RefreshCw />
          </button>
        </nav>
      </header>

      <div className="graph-body">
        <div className="graph-canvas" data-node-count={graphData.nodes.length}>
          {graphData.nodes.length ? (
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
              <GraphLoader graphData={graphData} colorMode={colorMode} />
              <GraphRenderSettings hoverState={hoverState} isDark={isDark} />
              <EventHandler
                onNodeClick={openPreview}
                onHoverChange={setHoverState}
              />
              <ZoomControls />
            </SigmaContainer>
          ) : (
            <div className="graph-empty">
              <Network />
              <strong>
                {loading
                  ? "그래프를 불러오는 중입니다."
                  : "연결된 페이지가 없습니다."}
              </strong>
            </div>
          )}

          <div
            className="graph-accessible-nodes"
            aria-label="그래프 페이지 목록"
          >
            {graphData.nodes.map((node) => (
              <button
                key={node.id}
                type="button"
                className="graph-accessible-node"
                data-graph-node-id={node.id}
                aria-label={`${node.title} 그래프 노드`}
                onClick={() => void openPreview(node.id)}
              >
                {node.title}
              </button>
            ))}
          </div>

          <aside className="graph-legend" aria-label="노드 유형">
            <strong>
              {colorMode === "type" ? "Node Types" : "Communities"}
            </strong>
            {colorMode === "type"
              ? Object.entries(typeCounts).map(([type, count]) => (
                  <div key={type}>
                    <i style={{ backgroundColor: nodeColor(type) }} />
                    <span>{TYPE_LABELS[type] ?? type}</span>
                    <b>{count}</b>
                  </div>
                ))
              : COMMUNITY_COLORS.slice(
                  0,
                  Math.min(COMMUNITY_COLORS.length, graphData.nodes.length),
                ).map((color, index) => (
                  <div key={color}>
                    <i style={{ backgroundColor: color }} />
                    <span>Community {index + 1}</span>
                  </div>
                ))}
          </aside>
        </div>

        {showInsights && !preview && (
          <aside className="graph-insights-panel">
            <header>
              <div>
                <Lightbulb />
                <strong>Insights</strong>
              </div>
              <button
                type="button"
                onClick={() => setShowInsights(false)}
                aria-label="인사이트 닫기"
              >
                <X />
              </button>
            </header>
            <section>
              <span>Graph summary</span>
              <strong>
                {graphData.nodes.length} pages · {graphData.edges.length} links
              </strong>
              <p>연결되지 않은 페이지 {isolatedNodes.length}개</p>
            </section>
            {isolatedNodes.length > 0 && (
              <section>
                <span>Knowledge gaps</span>
                {isolatedNodes.slice(0, 8).map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => void openPreview(node.id)}
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
            aria-label="그래프 문서 미리보기"
          >
            <header>
              <span title={preview.path || preview.title}>{preview.title}</span>
              <button
                type="button"
                onClick={() => setPreview(null)}
                aria-label="미리보기 닫기"
              >
                <X />
              </button>
            </header>
            <div className="graph-preview-scroll">
              {previewLoading && !preview.markdown ? (
                <div className="graph-preview-loading">문서를 불러오는 중…</div>
              ) : preview.markdown ? (
                <MarkdownPreview
                  value={preview.markdown}
                  onWikiLink={(title) => {
                    const target = graphData.nodes.find(
                      (node) =>
                        node.title.toLocaleLowerCase() ===
                        title.toLocaleLowerCase(),
                    );
                    if (target) void openPreview(target.id);
                  }}
                />
              ) : (
                <div className="graph-preview-loading">
                  미리보기를 불러오지 못했습니다.
                </div>
              )}
            </div>
            <footer>
              <span>
                <FileText /> v{preview.version}
              </span>
              <Button size="sm" onClick={() => onOpenPage(preview.id)}>
                문서 열기
              </Button>
            </footer>
          </aside>
        )}
      </div>

      {graphData.truncated && (
        <p className="graph-truncated">
          노드 한도에 도달해 일부 결과가 생략되었습니다.
        </p>
      )}
    </section>
  );
}
