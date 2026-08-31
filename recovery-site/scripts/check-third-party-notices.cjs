/* eslint-disable @typescript-eslint/no-require-imports */
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const manifest = require(join(root, "package.json"));
const projectLicense = readFileSync(join(root, "LICENSE"), "utf8");
const notices = readFileSync(join(root, "THIRD_PARTY_NOTICES.md"), "utf8");
const sourceProvenance = readFileSync(
  resolve(root, "..", "docs", "SOURCE_PROVENANCE.md"),
  "utf8",
);
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

if (!notices.includes("GPL-3.0-only"))
  failures.push("THIRD_PARTY_NOTICES.md must declare GPL-3.0-only");

for (const required of [
  "## Pinned source",
  "## Production Site file mapping",
  "## Recovery Site status",
  "## License handling",
])
  if (!sourceProvenance.includes(required))
    failures.push(`missing source provenance section: ${required}`);

if (manifest.license !== "GPL-3.0-only")
  failures.push("package.json must declare GPL-3.0-only");

for (const required of [
  "GNU GENERAL PUBLIC LICENSE",
  "Version 3, 29 June 2007",
])
  if (!projectLicense.includes(required))
    failures.push(`LICENSE is missing required GPL marker: ${required}`);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify({
      directRuntimeDependencies: Object.keys(manifest.dependencies ?? {})
        .length,
      sourceProvenanceRecorded: true,
      projectLicense: manifest.license,
    }),
  );
}
