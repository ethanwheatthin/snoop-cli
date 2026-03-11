import { fetchGitHubSignals } from "./github.js";
import type { PackageFacts } from "../types.js";

interface NpmDistTags {
  latest?: string;
}

interface NpmVersionRecord {
  dependencies?: Record<string, string>;
  license?: string;
  repository?: string | { url?: string };
  dist?: { unpackedSize?: number };
}

interface NpmPackageResponse {
  name: string;
  readme?: string;
  "dist-tags"?: NpmDistTags;
  time?: Record<string, string>;
  versions?: Record<string, NpmVersionRecord>;
}

async function fetchWeeklyDownloads(packageName: string): Promise<number> {
  const res = await fetch(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(packageName)}`);
  if (!res.ok) {
    return 0;
  }

  const json = (await res.json()) as { downloads?: number };
  return json.downloads ?? 0;
}

export async function fetchNpmFacts(packageName: string, requestedVersion?: string): Promise<PackageFacts> {
  const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`);
  if (!res.ok) {
    throw new Error(`Package '${packageName}' not found in npm registry`);
  }

  const data = (await res.json()) as NpmPackageResponse;

  const version = requestedVersion
    ? requestedVersion
    : data["dist-tags"]?.latest;

  if (!version) {
    throw new Error(`Unable to resolve latest npm version for '${packageName}'`);
  }

  const versionMeta = data.versions?.[version];
  if (!versionMeta) {
    throw new Error(`Version '${version}' not found for npm package '${packageName}'`);
  }

  const repositoryUrl =
    typeof versionMeta.repository === "string"
      ? versionMeta.repository
      : versionMeta.repository?.url;

  const [weeklyDownloads, github] = await Promise.all([
    fetchWeeklyDownloads(packageName),
    fetchGitHubSignals(repositoryUrl),
  ]);

  return {
    package: data.name,
    version,
    ecosystem: "npm",
    license: versionMeta.license ?? "UNKNOWN",
    dep_count: Object.keys(versionMeta.dependencies ?? {}).length,
    install_size_kb: Math.round((versionMeta.dist?.unpackedSize ?? 0) / 1024),
    weekly_downloads: weeklyDownloads,
    last_published: data.time?.[version] ?? new Date().toISOString(),
    readme_excerpt: (data.readme ?? "").slice(0, 3000),
    repository_url: repositoryUrl,
    github_open_issues: github.openIssues,
    github_last_commit: github.lastCommit,
  };
}
