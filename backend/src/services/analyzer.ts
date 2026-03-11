import type { AnalyzeResponse, Ecosystem, PackageFacts } from "../types.js";
import { fetchNpmFacts } from "./npm.js";
import { fetchPypiFacts } from "./pypi.js";
import { analyzeWithAnthropic } from "./anthropic.js";
import { computeHealthScore } from "./health.js";
import { getCachedAnalysis, setCachedAnalysis } from "./cache.js";
import { fetchVulnerabilities } from "./vuln.js";

async function getFacts(packageName: string, ecosystem: Ecosystem): Promise<PackageFacts> {
  if (ecosystem === "pip") {
    return fetchPypiFacts(packageName);
  }
  return fetchNpmFacts(packageName);
}

export async function analyzePackage(packageName: string, ecosystem: Ecosystem): Promise<AnalyzeResponse> {
  const facts = await getFacts(packageName, ecosystem);
  const cacheKey = `${ecosystem}:${facts.package}@${facts.version}`;

  const cached = await getCachedAnalysis(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  const vulnerabilities = await fetchVulnerabilities(facts.package, facts.version, ecosystem);
  const llmResult = await analyzeWithAnthropic(facts, vulnerabilities);
  const deterministicHealthScore = computeHealthScore({
    weeklyDownloads: facts.weekly_downloads,
    lastPublished: facts.last_published,
    githubLastCommit: facts.github_last_commit,
    githubOpenIssues: facts.github_open_issues,
  });

  const response: AnalyzeResponse = {
    package: facts.package,
    version: facts.version,
    ecosystem,
    summary: llmResult.summary,
    use_case: llmResult.use_case,
    alternatives: llmResult.alternatives,
    license_type: llmResult.license_type || facts.license,
    license_risk: llmResult.license_risk,
    dep_count: facts.dep_count,
    install_size_kb: facts.install_size_kb,
    weekly_downloads: facts.weekly_downloads,
    last_published: facts.last_published,
    health_score: Math.round((deterministicHealthScore + llmResult.health_score) / 2),
    vulnerabilities,
    cached: false,
  };

  await setCachedAnalysis(cacheKey, response);
  return response;
}
