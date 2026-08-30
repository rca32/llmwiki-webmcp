"use client";

import { useMemo, useState } from "react";
import { Maximize, Minus, Network, Plus, RefreshCw } from "lucide-react";

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
  const [zoom, setZoom] = useState(1);
  const layout = useMemo(() => {
    const nodes = graph?.nodes ?? [];
    const radius = Math.max(145, Math.min(250, nodes.length * 14));
    return new Map(
      nodes.map((node, index) => {
        const angle =
          (index / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
        const ring = index === 0 ? 0 : radius * (0.72 + (index % 3) * 0.13);
        return [
          node.id,
          { x: 400 + Math.cos(angle) * ring, y: 300 + Math.sin(angle) * ring },
        ];
      }),
    );
  }, [graph]);

  return (
    <section className="graph-view">
      <header className="graph-toolbar">
        <div>
          <Network />
          <span>
            <strong>Knowledge graph</strong>
            <small>
              {graph?.nodes.length ?? 0} nodes · {graph?.edges.length ?? 0}{" "}
              links
            </small>
          </span>
        </div>
        <nav aria-label="그래프 도구">
          <button
            type="button"
            onClick={() => setZoom((value) => Math.max(0.65, value - 0.15))}
            aria-label="축소"
          >
            <Minus />
          </button>
          <button
            type="button"
            onClick={() => setZoom((value) => Math.min(1.65, value + 0.15))}
            aria-label="확대"
          >
            <Plus />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            aria-label="그래프 맞춤"
          >
            <Maximize />
          </button>
          <button
            type="button"
            className={loading ? "loading" : undefined}
            onClick={onRefresh}
            disabled={loading}
            aria-label={loading ? "새로 고침 중" : "새로 고침"}
          >
            <RefreshCw />
          </button>
        </nav>
      </header>
      <div
        className="graph-canvas"
        style={{ "--graph-zoom": zoom } as React.CSSProperties}
      >
        {graph?.nodes.length ? (
          <svg
            viewBox="0 0 800 600"
            role="group"
            aria-label="페이지 연결 그래프"
          >
            <g
              className="graph-viewport"
              transform={`translate(${400 - 400 * zoom} ${300 - 300 * zoom}) scale(${zoom})`}
            >
              {graph.edges.map((edge, index) => {
                const source = layout.get(edge.source);
                const target = layout.get(edge.target);
                if (!source || !target) return null;
                return (
                  <line
                    key={`${edge.source}-${edge.target}-${index}`}
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                  />
                );
              })}
              {graph.nodes.map((node) => {
                const point = layout.get(node.id)!;
                const degree = graph.edges.filter(
                  (edge) => edge.source === node.id || edge.target === node.id,
                ).length;
                return (
                  <g
                    key={node.id}
                    className={`graph-svg-node type-${node.page_type}`}
                    transform={`translate(${point.x} ${point.y})`}
                    role="button"
                    tabIndex={0}
                    aria-label={node.title}
                    onClick={() => onOpenPage(node.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ")
                        onOpenPage(node.id);
                    }}
                  >
                    <title>{node.title}</title>
                    <circle className="graph-node-hit" r={28} />
                    <circle r={Math.min(18, 8 + degree * 1.6)} />
                    <text y={26} textAnchor="middle">
                      {node.title.slice(0, 22)}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        ) : (
          <div className="empty-view">
            <Network />
            <strong>
              {loading
                ? "그래프를 불러오는 중입니다."
                : "연결된 페이지가 없습니다."}
            </strong>
          </div>
        )}
      </div>
      {graph?.truncated && (
        <p className="graph-truncated">
          노드 한도에 도달해 일부 결과가 생략되었습니다.
        </p>
      )}
    </section>
  );
}
