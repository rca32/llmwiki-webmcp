import { describe, expect, it } from "vitest";
import {
  DEFAULT_KNOWLEDGE_MAP_POLICY,
  parseKnowledgeMapPatch,
} from "./knowledge-map";

const topicId = "11111111-1111-4111-8111-111111111111";
const pageId = "22222222-2222-4222-8222-222222222222";
const claimId = "33333333-3333-4333-8333-333333333333";

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

  it("parses overview and topic insight briefs without conflating omission and null", () => {
    const brief = {
      headline: "데이터 제품은 소유권과 실행 책임을 함께 옮긴다",
      synthesis:
        "분산 구조의 효과는 플랫폼 표준과 도메인 책임이 함께 작동할 때 나타난다.",
      takeaways: [
        {
          statement: "기술보다 운영 모델이 먼저다.",
          explanation: "팀 경계와 품질 책임이 명확해야 한다.",
          evidence: [{ claim_id: claimId }, { page_id: pageId }],
        },
      ],
      tensions: [],
      implications: [],
      questions: [
        {
          statement: "중앙 플랫폼 팀의 적정 범위는 어디까지인가?",
          evidence: [],
        },
      ],
    };
    const parsed = parseKnowledgeMapPatch({
      expected_version: 4,
      overview_brief: brief,
      topic_briefs: [{ topic: { topic_id: topicId }, brief: null }],
    });
    expect(parsed.overview_brief?.headline).toBe(brief.headline);
    expect(parsed.overview_brief?.takeaways[0].evidence).toHaveLength(2);
    expect(parsed.overview_brief?.takeaways[0].evidence[0]).toEqual({
      claim_id: claimId,
    });
    expect(parsed.topic_briefs).toEqual([
      { topic: { topic_id: topicId }, brief: null },
    ]);
    expect(
      Object.prototype.hasOwnProperty.call(
        parseKnowledgeMapPatch({ expected_version: 4 }),
        "overview_brief",
      ),
    ).toBe(false);
  });

  it("rejects invalid brief bounds and duplicate evidence", () => {
    const valid = {
      headline: "핵심 결론",
      synthesis: "검토 결과를 요약합니다.",
      takeaways: [
        {
          statement: "같은 근거를 반복하지 않는다.",
          evidence: [{ page_id: pageId }],
        },
      ],
      tensions: [],
      implications: [],
      questions: [],
    };
    expect(() =>
      parseKnowledgeMapPatch({
        expected_version: 0,
        overview_brief: { ...valid, headline: "x".repeat(161) },
      }),
    ).toThrow(/headline/);
    expect(() =>
      parseKnowledgeMapPatch({
        expected_version: 0,
        overview_brief: {
          ...valid,
          takeaways: [
            {
              statement: "중복",
              evidence: [{ page_id: pageId }, { page_id: pageId }],
            },
          ],
        },
      }),
    ).toThrow(/duplicate/);
    expect(() =>
      parseKnowledgeMapPatch({
        expected_version: 0,
        overview_brief: { ...valid, takeaways: [] },
      }),
    ).toThrow(/at least 1/);
  });
});
