import type { ChangeSet } from "./contracts";

export const FULL_CLIENT_CHANGE_SET: ChangeSet = {
  pages_changed: [],
  tree_changed: true,
  links_changed: true,
  search_changed: true,
  graph_changed: true,
  knowledge_changed: true,
  attachments_changed: [],
  deleted_pages_changed: true,
  session_changed: true,
};

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function normalizeClientChangeSet(value: unknown): ChangeSet {
  if (!value || typeof value !== "object") return FULL_CLIENT_CHANGE_SET;
  const input = value as Record<string, unknown>;
  return {
    pages_changed: stringList(input.pages_changed),
    tree_changed: input.tree_changed === true,
    links_changed: input.links_changed === true,
    search_changed: input.search_changed === true,
    graph_changed: input.graph_changed === true,
    knowledge_changed: input.knowledge_changed === true,
    attachments_changed: stringList(input.attachments_changed),
    deleted_pages_changed: input.deleted_pages_changed === true,
    session_changed: input.session_changed === true,
  };
}

export function mergeClientChangeSets(
  current: ChangeSet | null,
  incoming: ChangeSet,
): ChangeSet {
  if (!current) return normalizeClientChangeSet(incoming);
  return {
    pages_changed: [
      ...new Set([...current.pages_changed, ...incoming.pages_changed]),
    ],
    tree_changed: current.tree_changed || incoming.tree_changed,
    links_changed: current.links_changed || incoming.links_changed,
    search_changed: current.search_changed || incoming.search_changed,
    graph_changed: current.graph_changed || incoming.graph_changed,
    knowledge_changed: current.knowledge_changed || incoming.knowledge_changed,
    attachments_changed: [
      ...new Set([
        ...(current.attachments_changed ?? []),
        ...(incoming.attachments_changed ?? []),
      ]),
    ],
    deleted_pages_changed:
      current.deleted_pages_changed || incoming.deleted_pages_changed,
    session_changed: current.session_changed || incoming.session_changed,
  };
}

export function clientChangeSetHasWork(changeSet: ChangeSet): boolean {
  return (
    changeSet.pages_changed.length > 0 ||
    changeSet.tree_changed ||
    changeSet.links_changed ||
    changeSet.search_changed ||
    changeSet.graph_changed ||
    changeSet.knowledge_changed ||
    Boolean(changeSet.attachments_changed?.length) ||
    Boolean(changeSet.deleted_pages_changed) ||
    Boolean(changeSet.session_changed)
  );
}
