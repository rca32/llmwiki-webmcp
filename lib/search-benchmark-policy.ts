export function searchBenchmarkEnabled(
  nodeEnv = process.env.NODE_ENV,
  explicitFlag = process.env.ENABLE_SEARCH_BENCHMARK,
) {
  return nodeEnv !== "production" || explicitFlag === "true";
}
