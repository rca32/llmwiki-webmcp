import { describe, expect, it } from "vitest";

import {
  buildGraphTopology,
  detectGraphCommunities,
  filterGraph,
  getLocalNodeIds,
  getNodeConnections,
  type WikiGraph,
} from "./graph-exploration";

function graphFixture(): WikiGraph {
  return {
    nodes: [
      { id: "a", title: "Alpha", page_type: "concept", version: 1 },
      { id: "b", title: "Beta", page_type: "source", version: 1 },
      { id: "c", title: "Gamma", page_type: "concept", version: 1 },
      { id: "d", title: "Delta", page_type: "source", version: 1 },
      { id: "e", title: "Orphan", page_type: "note", version: 1 },
    ],
    edges: [
      { source: "a", target: "b", target_text: "Beta" },
      { source: "b", target: "a", target_text: "Alpha" },
      { source: "c", target: "d", target_text: "Delta" },
      { source: "d", target: "c", target_text: "Gamma" },
    ],
    truncated: false,
  };
}

describe("graph exploration", () => {
  it("builds undirected navigation while preserving directed connections", () => {
    const graph = graphFixture();
    const topology = buildGraphTopology(graph);

    expect([...getLocalNodeIds(topology, "a", 1)]).toEqual(["a", "b"]);
    expect(topology.degree.get("a")).toBe(2);
    expect(getNodeConnections(graph, "a")).toEqual([
      { direction: "outgoing", nodeId: "b", label: "Beta" },
      { direction: "incoming", nodeId: "b", label: "Alpha" },
    ]);
  });

  it("filters global and local views without losing the local root", () => {
    const graph = graphFixture();
    const topology = buildGraphTopology(graph);

    const global = filterGraph(graph, topology, {
      query: "",
      pageType: "all",
      includeOrphans: false,
      scope: "global",
      rootId: null,
      depth: 1,
    });
    expect(global.nodes.map((node) => node.id)).toEqual(["a", "b", "c", "d"]);

    const local = filterGraph(graph, topology, {
      query: "does not match",
      pageType: "source",
      includeOrphans: false,
      scope: "local",
      rootId: "a",
      depth: 1,
    });
    expect(local.nodes.map((node) => node.id)).toEqual(["a"]);
  });

  it("derives deterministic communities from graph connectivity", () => {
    const graph = graphFixture();
    const first = detectGraphCommunities(graph);
    const second = detectGraphCommunities(graph);

    expect(first).toEqual(second);
    expect(first.get("a")).toBe(first.get("b"));
    expect(first.get("c")).toBe(first.get("d"));
    expect(first.get("a")).not.toBe(first.get("c"));
    expect(first.get("e")).toBe(-1);
  });
});
