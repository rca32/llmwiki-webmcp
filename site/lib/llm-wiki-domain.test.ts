import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPERATING_CONTRACT,
  buildWikiLintReport,
  canonicalIngestPlanHash,
  classifyIngestPageAction,
  isIngestPlanExpired,
  parseIngestRequest,
  parseOperatingContract,
} from "./llm-wiki-domain";

const source = {
  title: "Primary source",
  markdown: "# Primary source\n\nEvidence.",
  parent_id: null,
  source_url: "https://example.com/article",
  retrieval_status: "success",
  retrieved_at: "2026-08-30T00:00:00Z",
  extraction_method: "direct-html",
  confidence: 0.9,
};

describe("LLM Wiki domain contracts", () => {
  it("accepts and normalizes the safe default operating contract", () => {
    expect(parseOperatingContract(DEFAULT_OPERATING_CONTRACT)).toEqual(
      DEFAULT_OPERATING_CONTRACT,
    );
  });

  it("requires source pages in every operating contract", () => {
    expect(() =>
      parseOperatingContract({
        ...DEFAULT_OPERATING_CONTRACT,
        allowed_page_types: ["concept"],
      }),
    ).toThrow(/must include source/);
  });

  it("normalizes ingest input and rejects duplicate proposed titles", () => {
    const parsed = parseIngestRequest({
      source,
      pages: [
        {
          title: "A concept",
          page_type: "concept",
          markdown: "# A concept",
        },
      ],
      claims: [
        {
          subject: { title: "A concept" },
          predicate: "supported by",
          object: { value: "the cited evidence" },
          evidence_fragment: "Evidence.",
          confidence: 0.8,
        },
      ],
    });
    expect(parsed.source.retrieved_at).toBe("2026-08-30T00:00:00.000Z");
    expect(parsed.claims[0].source_page_id).toBeNull();
    expect(() =>
      parseIngestRequest({
        source,
        pages: [
          { title: "Same", page_type: "concept", markdown: "one" },
          { title: "same", page_type: "entity", markdown: "two" },
        ],
      }),
    ).toThrow(/titles must be unique/);
  });

  it("rejects missing source URLs and inverted claim validity", () => {
    expect(() =>
      parseIngestRequest({ source: { ...source, source_url: null } }),
    ).toThrow(/source_url is required/);
    expect(() =>
      parseIngestRequest({
        source,
        claims: [
          {
            subject: { title: "Primary source" },
            predicate: "has status",
            object: { value: "old" },
            evidence_fragment: "Evidence.",
            confidence: 0.5,
            valid_from: "2026-08-30T00:00:00Z",
            valid_to: "2026-08-29T00:00:00Z",
          },
        ],
      }),
    ).toThrow(/valid_to/);
  });

  it("classifies create and version-bound update actions", () => {
    expect(classifyIngestPageAction(null)).toEqual({
      kind: "create",
      target_page_id: null,
      expected_version: null,
    });
    expect(classifyIngestPageAction({ id: "page-one", version: 7 })).toEqual({
      kind: "update",
      target_page_id: "page-one",
      expected_version: 7,
    });
  });

  it("uses a canonical plan hash and deterministic expiry", async () => {
    await expect(canonicalIngestPlanHash({ b: 2, a: 1 })).resolves.toBe(
      await canonicalIngestPlanHash({ a: 1, b: 2 }),
    );
    expect(
      isIngestPlanExpired(
        "2026-08-29T00:00:00.000Z",
        new Date("2026-08-30T00:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("reports provenance, graph, duplicate, expiry, and confidence issues", () => {
    const report = buildWikiLintReport({
      contract: {
        ...DEFAULT_OPERATING_CONTRACT,
        minimum_source_confidence: 0.7,
      },
      limit: 100,
      at: new Date("2026-08-30T00:00:00.000Z"),
      pages: [
        {
          id: "source",
          parent_id: null,
          title: "Source",
          slug: "source",
          page_type: "source",
          source_url: null,
          retrieval_status: "partial",
          retrieved_at: null,
          extraction_method: null,
          confidence: 0.4,
        },
        {
          id: "concept-a",
          parent_id: null,
          title: "Topic",
          slug: "topic-a",
          page_type: "concept",
          source_url: null,
          retrieval_status: null,
          retrieved_at: null,
          extraction_method: null,
          confidence: null,
        },
        {
          id: "concept-b",
          parent_id: null,
          title: "topic",
          slug: "topic-b",
          page_type: "concept",
          source_url: null,
          retrieval_status: null,
          retrieved_at: null,
          extraction_method: null,
          confidence: null,
        },
      ],
      links: [
        {
          source_page_id: "concept-a",
          target_page_id: null,
          target_text: "Missing",
        },
      ],
      claims: [
        {
          id: "claim",
          subject_page_id: "concept-a",
          source_page_id: "deleted-source",
          valid_to: "2026-08-29T00:00:00.000Z",
        },
      ],
    });
    expect(new Set(report.issues.map((issue) => issue.code))).toEqual(
      new Set([
        "missing_source_metadata",
        "low_confidence_source",
        "unresolved_link",
        "duplicate_title",
        "orphan_page",
        "ungrounded_claim",
        "expired_claim",
      ]),
    );
    expect(report.counts.error).toBeGreaterThan(0);
    expect(report.truncated).toBe(false);
  });
});
