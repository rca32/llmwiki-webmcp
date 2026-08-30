/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const projectRoot = path.resolve(__dirname, "..");
const budgetPath = path.join(__dirname, "bundle-budget.json");
const budget = JSON.parse(fs.readFileSync(budgetPath, "utf8"));
const clientRoot = path.join(projectRoot, budget.client_directory);

if (!fs.existsSync(clientRoot)) {
  throw new Error(
    `Client build output is missing at ${clientRoot}. Run \"npm run build\" first.`,
  );
}

const javascriptFiles = [];
function collectJavascript(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectJavascript(absolutePath);
    else if (entry.name.endsWith(".js")) javascriptFiles.push(absolutePath);
  }
}
collectJavascript(clientRoot);

if (!javascriptFiles.length)
  throw new Error(`No JavaScript assets were found under ${clientRoot}.`);

const assets = javascriptFiles.map((absolutePath) => {
  const contents = fs.readFileSync(absolutePath);
  return {
    path: path.relative(projectRoot, absolutePath).replaceAll("\\", "/"),
    raw_bytes: contents.length,
    gzip_bytes: zlib.gzipSync(contents, { level: 9 }).length,
  };
});
const appPageAssets = assets.filter((asset) =>
  /\/_next\/static\/chunks\/page-[^/]+\.js$/.test(asset.path),
);
if (appPageAssets.length !== 1)
  throw new Error(
    `Expected one app page chunk, found ${appPageAssets.length}: ${appPageAssets.map((asset) => asset.path).join(", ")}`,
  );

const largestAsset = [...assets].sort(
  (left, right) => right.gzip_bytes - left.gzip_bytes,
)[0];
const actual = {
  js_file_count: assets.length,
  total_raw_bytes: assets.reduce((sum, asset) => sum + asset.raw_bytes, 0),
  total_gzip_bytes: assets.reduce((sum, asset) => sum + asset.gzip_bytes, 0),
  largest_chunk_gzip_bytes: largestAsset.gzip_bytes,
  app_page_chunk_gzip_bytes: appPageAssets[0].gzip_bytes,
};

const checks = Object.entries(budget.limits).map(([metric, limit]) => ({
  metric,
  actual: actual[metric],
  baseline: budget.baseline[metric],
  limit,
  passed: actual[metric] <= limit,
}));
const failed = checks.filter((check) => !check.passed);
const comparison = Object.fromEntries(
  checks.map((check) => [
    check.metric,
    {
      actual: check.actual,
      baseline: check.baseline,
      delta_percent: Number(
        (((check.actual - check.baseline) / check.baseline) * 100).toFixed(2),
      ),
      limit: check.limit,
      passed: check.passed,
    },
  ]),
);

console.log(
  JSON.stringify(
    {
      comparison,
      largest_chunk: largestAsset,
      app_page_chunk: appPageAssets[0],
    },
    null,
    2,
  ),
);

if (failed.length) {
  throw new Error(
    `Bundle budget exceeded: ${failed.map((check) => `${check.metric}=${check.actual} (limit ${check.limit})`).join(", ")}`,
  );
}
