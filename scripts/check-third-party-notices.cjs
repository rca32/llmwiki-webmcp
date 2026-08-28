/* eslint-disable @typescript-eslint/no-require-imports */
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const manifest = require(join(root, "package.json"));
const notices = readFileSync(join(root, "THIRD_PARTY_NOTICES.md"), "utf8");
const normalizedRows = notices.split(/\r?\n/).map((line) =>
  line
    .split("|")
    .map((cell) => cell.trim())
    .join("|"),
);
const failures = [];

for (const name of Object.keys(manifest.dependencies ?? {}).sort()) {
  const dependency = require(join(root, "node_modules", name, "package.json"));
  const license = Array.isArray(dependency.license)
    ? dependency.license.join(" OR ")
    : dependency.license;
  if (!license) {
    failures.push(`${name}: installed package has no declared license`);
    continue;
  }
  const expected = `|\`${name}\`|\`${dependency.version}\`|\`${license}\`|`;
  if (!normalizedRows.some((row) => row.startsWith(expected)))
    failures.push(
      `${name}: expected THIRD_PARTY_NOTICES.md row ${JSON.stringify(expected)}`,
    );
}

for (const required of [
  "e8082119649e6a8e1cf85eaf289adcabfdf39d4e",
  "UPSTREAM_PROVENANCE.md",
  "has not yet been selected",
])
  if (!notices.includes(required))
    failures.push(`missing required provenance marker: ${required}`);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify({
      directRuntimeDependencies: Object.keys(manifest.dependencies ?? {})
        .length,
      upstreamBaselineRecorded: true,
      projectLicenseDecisionPending: true,
    }),
  );
}
