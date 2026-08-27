"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { visit } from "unist-util-visit";

type TextNode = { type: "text"; value: string };
type LinkNode = { type: "link"; url: string; children: TextNode[] };
type ParentNode = {
  children: Array<TextNode | LinkNode | Record<string, unknown>>;
};

function remarkWikiLinks() {
  return (tree: unknown) => {
    visit(
      tree as Parameters<typeof visit>[0],
      "text",
      (
        node: TextNode,
        index: number | undefined,
        parent: ParentNode | undefined,
      ) => {
        if (index === undefined || !parent || !node.value.includes("[["))
          return;
        const pieces: Array<TextNode | LinkNode> = [],
          pattern = /\[\[([^\]\n]{1,200})\]\]/g;
        let cursor = 0,
          match: RegExpExecArray | null;
        while ((match = pattern.exec(node.value))) {
          if (match.index > cursor)
            pieces.push({
              type: "text",
              value: node.value.slice(cursor, match.index),
            });
          const title = match[1].trim();
          pieces.push({
            type: "link",
            url: `wiki:${encodeURIComponent(title)}`,
            children: [{ type: "text", value: title }],
          });
          cursor = match.index + match[0].length;
        }
        if (!pieces.length) return;
        if (cursor < node.value.length)
          pieces.push({ type: "text", value: node.value.slice(cursor) });
        parent.children.splice(index, 1, ...pieces);
        return index + pieces.length;
      },
    );
  };
}

function MermaidDiagram({ source }: { source: string }) {
  const rawId = useId(),
    id = `mermaid-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    [svg, setSvg] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void import("mermaid").then(async ({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "neutral",
        suppressErrorRendering: true,
      });
      try {
        const result = await mermaid.render(id, source);
        if (active) {
          setSvg(result.svg);
          setError("");
        }
      } catch {
        if (active) {
          setSvg("");
          setError("Mermaid 다이어그램을 렌더링할 수 없습니다.");
        }
      }
    });
    return () => {
      active = false;
    };
  }, [id, source]);
  if (error) return <pre className="mermaid-error">{error}</pre>;
  if (!svg) return <div className="mermaid-loading">다이어그램 렌더링 중…</div>;
  return (
    <div
      className="mermaid-diagram"
      role="img"
      aria-label="Mermaid diagram"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function MarkdownPreview({
  value,
  onWikiLink,
}: {
  value: string;
  onWikiLink: (title: string) => void;
}) {
  return (
    <div className="markdown-preview">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkWikiLinks]}
        rehypePlugins={[rehypeKatex]}
        urlTransform={(url) =>
          url.startsWith("wiki:") ? url : defaultUrlTransform(url)
        }
        components={{
          a: ({ href, children }) =>
            href?.startsWith("wiki:") ? (
              <button
                className="wiki-link"
                onClick={() => onWikiLink(decodeURIComponent(href.slice(5)))}
              >
                {children}
              </button>
            ) : (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            ),
          code: ({
            className,
            children,
            ...props
          }: {
            className?: string;
            children?: ReactNode;
          }) =>
            className === "language-mermaid" ? (
              <MermaidDiagram source={String(children).replace(/\n$/, "")} />
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            ),
        }}
      >
        {value}
      </ReactMarkdown>
    </div>
  );
}
