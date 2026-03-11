import { fetchGitHubSignals } from "./github.js";
import type { PackageFacts } from "../types.js";

interface PyPiInfo {
  name?: string;
  version?: string;
  license?: string;
  summary?: string;
  description?: string;
  requires_dist?: string[];
  package_url?: string;
  project_urls?: Record<string, string>;
}

interface PyPiResponse {
  info: PyPiInfo;
  releases: Record<string, Array<{ size?: number; upload_time_iso_8601?: string }>>;
}

function resolveRepositoryUrl(info: PyPiInfo): string | undefined {
  const urls = info.project_urls ?? {};
  const entries = Object.entries(urls);
  const github = entries.find(([, v]) => v.toLowerCase().includes("github.com"));
  return github?.[1];
}

export async function fetchPypiFacts(packageName: string): Promise<PackageFacts> {
  const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`);
  if (!res.ok) {
    throw new Error(`Package '${packageName}' not found in PyPI`);
  }

  const data = (await res.json()) as PyPiResponse;
  const version = data.info.version;
  if (!version) {
    throw new Error(`Unable to resolve latest PyPI version for '${packageName}'`);
  }

  const releaseFiles = data.releases[version] ?? [];
  const installSizeBytes = releaseFiles.reduce((acc, file) => acc + (file.size ?? 0), 0);
  const lastPublished =
    releaseFiles[0]?.upload_time_iso_8601 ?? new Date().toISOString();

  const repositoryUrl = resolveRepositoryUrl(data.info);
  const github = await fetchGitHubSignals(repositoryUrl);

  return {
    package: data.info.name ?? packageName,
    version,
    ecosystem: "pip",
    license: data.info.license ?? "UNKNOWN",
    dep_count: data.info.requires_dist?.length ?? 0,
    install_size_kb: Math.round(installSizeBytes / 1024),
    weekly_downloads: 0,
    last_published: lastPublished,
    readme_excerpt: (data.info.description ?? data.info.summary ?? "").slice(0, 3000),
    repository_url: repositoryUrl,
    github_open_issues: github.openIssues,
    github_last_commit: github.lastCommit,
  };
}
