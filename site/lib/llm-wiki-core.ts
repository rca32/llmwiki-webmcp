export const LLM_WIKI_CORE_IDEA =
  "Maintain a persistent, source-grounded Markdown wiki that compounds over time: preserve each source, integrate new evidence into canonical entity, concept, and synthesis pages, track provenance and contradictions, and reuse the wiki instead of re-deriving knowledge from scratch.";

export const LLM_WIKI_META_DESCRIPTION =
  "A persistent, source-grounded Markdown wiki that preserves sources and integrates new evidence into canonical knowledge pages over time.";

export const LLM_WIKI_CORE_ANTI_PATTERN =
  "A temporary retrieval scratchpad or a pile of disconnected source summaries.";

export const LLM_WIKI_CORE_INVARIANTS = [
  "Read the active vault context and operating contract before substantial work.",
  "Search existing canonical pages before creating a new page.",
  "Read the topic organization before proposing topics; reuse existing topics and preserve user locks.",
  "Preserve retrieved material as a source page with structured metadata.",
  "Keep evidence separate from synthesis and ground claims in sources.",
  "Integrate new evidence into canonical entity, concept, and synthesis pages.",
  "Record contradictions and superseding claims without erasing history.",
  "Plan and review ingestion before applying it, then lint and verify the result.",
] as const;

export const LLM_WIKI_REQUIRED_WORKFLOW = [
  "wiki_get_context",
  "wiki_get_operating_contract",
  "wiki_get_knowledge_map",
  "wiki_search",
  "wiki_plan_ingest",
  "review_plan_with_user",
  "wiki_apply_ingest",
  "wiki_lint",
] as const;
