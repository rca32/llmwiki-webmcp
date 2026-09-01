import { describe, expect, it } from "vitest";
import {
  DEFAULT_KNOWLEDGE_MAP_POLICY,
  parseKnowledgeMapPatch,
} from "./knowledge-map";

const topicId = "11111111-1111-4111-8111-111111111111";
const pageId = "22222222-2222-4222-8222-222222222222";

describe("Knowledge Atlas patch contract", () => {
  it("keeps the bounded default generation policy", () => {
    expect(DEFAULT_KNOWLEDGE_MAP_POLICY).toMatchObject({
      max_depth: 4,
      max_placements_per_page: 3,
      top_level_min: 3,
      top_level_max: 7,
      manual_lock_policy: "preserve",
      evidence_mode: "collapsed",
    });
  });

  it("parses existing and newly proposed semantic references", () => {
    expect(
      parseKnowledgeMapPatch({
        expected_version: 3,
        topics: [
          {
            client_key: "market",
            topic_id: topicId,
            parent: null,
            title: "시장 변화",
            summary: "수요와 공급의 변화를 묶습니다.",
            presentation: "cluster",
            sort_order: 0,
          },
        ],
        placements: [
          {
            placement_id: null,
            topic: { client_key: "market" },
            page: { page_id: pageId },
            role: "primary",
            summary: "시장의 핵심 개요",
            sort_order: 0,
          },
        ],
        remove_placement_ids: [],
      }),
    ).toMatchObject({
      expected_version: 3,
      topics: [{ presentation: "cluster" }],
      placements: [{ role: "primary", page: { page_id: pageId } }],
    });
  });

  it("requires exactly one stable page or topic reference", () => {
    expect(() =>
      parseKnowledgeMapPatch({
        expected_version: 0,
        topics: [],
        placements: [
          {
            topic: { topic_id: topicId, client_key: "also-present" },
            page: { page_id: pageId, title: "also present" },
            role: "primary",
            summary: "invalid",
          },
        ],
      }),
    ).toThrow(/exactly one/);
  });

  it("rejects unsupported presentations, roles, and duplicate client keys", () => {
    const baseTopic = {
      client_key: "same",
      topic_id: null,
      parent: null,
      title: "의미 주제",
      summary: "의미 기반 묶음",
      presentation: "cluster",
    };
    expect(() =>
      parseKnowledgeMapPatch({
        expected_version: 0,
        topics: [baseTopic, { ...baseTopic, title: "다른 이름" }],
      }),
    ).toThrow(/client_key/);
    expect(() =>
      parseKnowledgeMapPatch({
        expected_version: 0,
        topics: [{ ...baseTopic, presentation: "folder" }],
      }),
    ).toThrow(/not supported/);
    expect(() =>
      parseKnowledgeMapPatch({
        expected_version: 0,
        placements: [
          {
            topic: { topic_id: topicId },
            page: { page_id: pageId },
            role: "secondary",
            summary: "invalid",
          },
        ],
      }),
    ).toThrow(/not supported/);
  });
});
