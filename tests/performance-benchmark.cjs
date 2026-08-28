const baseUrl = process.env.WIKI_URL || "http://127.0.0.1:3000";
const pageCount = Number(process.env.WIKI_BENCHMARK_PAGE_COUNT || 10_000);

(async () => {
  const response = await fetch(`${baseUrl}/api/maintenance/search-benchmark`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ page_count: pageCount }),
  });
  const envelope = await response.json();
  if (!response.ok)
    throw new Error(
      `Performance benchmark failed (${response.status}): ${JSON.stringify(envelope)}`,
    );
  const result = envelope.data;
  if (
    result.page_count !== pageCount ||
    result.search?.target_met !== true ||
    result.page_read?.target_met !== true ||
    result.tree_first_page?.node_cap_met !== true ||
    result.cleanup_verified !== true
  )
    throw new Error(
      `Performance budget or cleanup failed: ${JSON.stringify(result)}`,
    );
  console.log(JSON.stringify(result));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
