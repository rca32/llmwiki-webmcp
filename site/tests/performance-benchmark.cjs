const baseUrl = process.env.WIKI_URL || "http://127.0.0.1:3000";
const pageCount = Number(process.env.WIKI_BENCHMARK_PAGE_COUNT || 10_000);
const seedChunkSize = 1_000;

async function benchmarkRequest(body) {
  const response = await fetch(`${baseUrl}/api/maintenance/search-benchmark`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw new Error(
      `Performance benchmark returned non-JSON (${response.status}): ${text.slice(0, 200)}`,
    );
  }
  if (!response.ok)
    throw new Error(
      `Performance benchmark failed (${response.status}): ${JSON.stringify(envelope)}`,
    );
  return envelope.data;
}

(async () => {
  const runId = crypto.randomUUID();
  let result;
  let cleanup;
  try {
    for (let offset = 0; offset < pageCount; offset += seedChunkSize) {
      const count = Math.min(seedChunkSize, pageCount - offset);
      const seeded = await benchmarkRequest({
        action: "seed",
        run_id: runId,
        page_count: pageCount,
        offset,
        count,
      });
      if (
        seeded.seeded_count !== count ||
        seeded.next_offset !== offset + count
      )
        throw new Error(
          `Performance seed progress was invalid: ${JSON.stringify(seeded)}`,
        );
    }
    result = await benchmarkRequest({
      action: "measure",
      run_id: runId,
      page_count: pageCount,
    });
  } finally {
    cleanup = await benchmarkRequest({ action: "cleanup", run_id: runId });
  }
  result = { ...result, ...cleanup };
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
