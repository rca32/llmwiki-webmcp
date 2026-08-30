import { describe, expect, it } from "vitest";
import { searchBenchmarkEnabled } from "./search-benchmark-policy";

describe("search benchmark policy", () => {
  it("keeps hosted benchmarks disabled by default", () => {
    expect(searchBenchmarkEnabled("production", undefined)).toBe(false);
    expect(searchBenchmarkEnabled("production", "false")).toBe(false);
    expect(searchBenchmarkEnabled("production", "TRUE")).toBe(false);
  });

  it("requires an exact explicit hosted enable flag", () => {
    expect(searchBenchmarkEnabled("production", "true")).toBe(true);
  });

  it("keeps isolated development benchmarks available", () => {
    expect(searchBenchmarkEnabled("development", undefined)).toBe(true);
    expect(searchBenchmarkEnabled("test", undefined)).toBe(true);
  });
});
