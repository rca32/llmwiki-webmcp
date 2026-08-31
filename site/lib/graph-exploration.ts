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

export type GraphTopology = {
  adjacency: Map<string, Set<string>>;
  degree: Map<string, number>;
};

export type GraphViewFilters = {
  query: string;
  pageType: string;
  includeOrphans: boolean;
  scope: "global" | "local";
  rootId: string | null;
  depth: 1 | 2 | 3;
};

export type NodeConnection = {
  direction: "incoming" | "outgoing";
  nodeId: string;
  label: string;
};

export function buildGraphTopology(graph: WikiGraph): GraphTopology {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const adjacency = new Map<string, Set<string>>();
  const degree = new Map<string, number>();

  for (const nodeId of nodeIds) {
    adjacency.set(nodeId, new Set());
    degree.set(nodeId, 0);
  }

  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    if (edge.source !== edge.target) {
      adjacency.get(edge.source)?.add(edge.target);
      adjacency.get(edge.target)?.add(edge.source);
    }
  }

  return { adjacency, degree };
}

export function getLocalNodeIds(
  topology: GraphTopology,
  rootId: string,
  depth: 1 | 2 | 3,
): Set<string> {
  if (!topology.adjacency.has(rootId)) return new Set();
  const visited = new Set([rootId]);
  let frontier = new Set([rootId]);

  for (let level = 0; level < depth; level += 1) {
    const next = new Set<string>();
    for (const nodeId of frontier) {
      for (const neighbor of topology.adjacency.get(nodeId) ?? []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        next.add(neighbor);
      }
    }
    if (next.size === 0) break;
    frontier = next;
  }

  return visited;
}

export function filterGraph(
  graph: WikiGraph,
  topology: GraphTopology,
  filters: GraphViewFilters,
): WikiGraph {
  const query = filters.query.trim().toLocaleLowerCase();
  const scoped =
    filters.scope === "local" && filters.rootId
      ? getLocalNodeIds(topology, filters.rootId, filters.depth)
      : new Set(graph.nodes.map((node) => node.id));

  const visibleIds = new Set(
    graph.nodes
      .filter((node) => scoped.has(node.id))
      .filter(
        (node) => !query || node.title.toLocaleLowerCase().includes(query),
      )
      .filter(
        (node) =>
          filters.pageType === "all" || node.page_type === filters.pageType,
      )
      .filter(
        (node) =>
          filters.includeOrphans ||
          (topology.degree.get(node.id) ?? 0) > 0 ||
          node.id === filters.rootId,
      )
      .map((node) => node.id),
  );

  // Keep the local root visible so the user never loses the graph's anchor.
  if (
    filters.scope === "local" &&
    filters.rootId &&
    graph.nodes.some((node) => node.id === filters.rootId)
  ) {
    visibleIds.add(filters.rootId);
  }

  return {
    nodes: graph.nodes.filter((node) => visibleIds.has(node.id)),
    edges: graph.edges.filter(
      (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
    ),
    truncated: graph.truncated,
  };
}

/**
 * Deterministic modularity-based local moving. This is intentionally small,
 * but unlike color hashing it groups nodes from the actual link topology.
 */
export function detectGraphCommunities(graph: WikiGraph): Map<string, number> {
  const nodeIds = graph.nodes.map((node) => node.id).sort();
  const validIds = new Set(nodeIds);
  const weighted = new Map<string, Map<string, number>>(
    nodeIds.map((nodeId) => [nodeId, new Map()]),
  );
  const degree = new Map(nodeIds.map((nodeId) => [nodeId, 0]));
  let totalEdgeWeight = 0;

  for (const edge of graph.edges) {
    if (
      edge.source === edge.target ||
      !validIds.has(edge.source) ||
      !validIds.has(edge.target)
    ) {
      continue;
    }
    const sourceNeighbors = weighted.get(edge.source);
    const targetNeighbors = weighted.get(edge.target);
    sourceNeighbors?.set(
      edge.target,
      (sourceNeighbors.get(edge.target) ?? 0) + 1,
    );
    targetNeighbors?.set(
      edge.source,
      (targetNeighbors.get(edge.source) ?? 0) + 1,
    );
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    totalEdgeWeight += 1;
  }

  if (totalEdgeWeight === 0) {
    return new Map(nodeIds.map((nodeId) => [nodeId, -1]));
  }

  const community = new Map(nodeIds.map((nodeId) => [nodeId, nodeId]));
  const communityDegree = new Map(
    nodeIds.map((nodeId) => [nodeId, degree.get(nodeId) ?? 0]),
  );
  const orderedNodes = [...nodeIds].sort((left, right) => {
    const difference = (degree.get(right) ?? 0) - (degree.get(left) ?? 0);
    return difference || left.localeCompare(right);
  });
  const twiceWeight = totalEdgeWeight * 2;

  for (let iteration = 0; iteration < 24; iteration += 1) {
    let moved = false;
    for (const nodeId of orderedNodes) {
      const nodeDegree = degree.get(nodeId) ?? 0;
      if (nodeDegree === 0) continue;
      const current = community.get(nodeId) ?? nodeId;
      communityDegree.set(
        current,
        (communityDegree.get(current) ?? 0) - nodeDegree,
      );

      const weightsByCommunity = new Map<string, number>();
      for (const [neighborId, weight] of weighted.get(nodeId) ?? []) {
        const neighborCommunity = community.get(neighborId) ?? neighborId;
        weightsByCommunity.set(
          neighborCommunity,
          (weightsByCommunity.get(neighborCommunity) ?? 0) + weight,
        );
      }

      let bestCommunity = current;
      let bestScore =
        (weightsByCommunity.get(current) ?? 0) -
        (nodeDegree * (communityDegree.get(current) ?? 0)) / twiceWeight;
      for (const [candidate, internalWeight] of weightsByCommunity) {
        const score =
          internalWeight -
          (nodeDegree * (communityDegree.get(candidate) ?? 0)) / twiceWeight;
        if (
          score > bestScore + Number.EPSILON ||
          (Math.abs(score - bestScore) <= Number.EPSILON &&
            candidate.localeCompare(bestCommunity) < 0)
        ) {
          bestCommunity = candidate;
          bestScore = score;
        }
      }

      community.set(nodeId, bestCommunity);
      communityDegree.set(
        bestCommunity,
        (communityDegree.get(bestCommunity) ?? 0) + nodeDegree,
      );
      if (bestCommunity !== current) moved = true;
    }
    if (!moved) break;
  }

  const groups = new Map<string, string[]>();
  for (const nodeId of nodeIds) {
    if ((degree.get(nodeId) ?? 0) === 0) continue;
    const label = community.get(nodeId) ?? nodeId;
    const group = groups.get(label) ?? [];
    group.push(nodeId);
    groups.set(label, group);
  }
  const orderedGroups = [...groups.entries()].sort((left, right) => {
    const sizeDifference = right[1].length - left[1].length;
    return sizeDifference || left[0].localeCompare(right[0]);
  });
  const communityIndex = new Map(
    orderedGroups.map(([label], index) => [label, index]),
  );

  return new Map(
    nodeIds.map((nodeId) => {
      if ((degree.get(nodeId) ?? 0) === 0) return [nodeId, -1];
      return [
        nodeId,
        communityIndex.get(community.get(nodeId) ?? nodeId) ?? -1,
      ];
    }),
  );
}

export function getNodeConnections(
  graph: WikiGraph,
  nodeId: string,
): NodeConnection[] {
  const connections: NodeConnection[] = [];
  for (const edge of graph.edges) {
    if (edge.source === nodeId) {
      connections.push({
        direction: "outgoing",
        nodeId: edge.target,
        label: edge.target_text,
      });
    }
    if (edge.target === nodeId) {
      connections.push({
        direction: "incoming",
        nodeId: edge.source,
        label: edge.target_text,
      });
    }
  }
  return connections;
}
