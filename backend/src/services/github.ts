interface GitHubSignals {
  openIssues?: number;
  lastCommit?: string;
}

function parseGitHubRepoUrl(repositoryUrl?: string): { owner: string; repo: string } | null {
  if (!repositoryUrl) {
    return null;
  }

  const normalized = repositoryUrl
    .replace("git+", "")
    .replace(/\.git$/, "")
    .trim();

  const match = normalized.match(/github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/]+)/i);
  if (!match?.groups?.owner || !match.groups.repo) {
    return null;
  }

  return { owner: match.groups.owner, repo: match.groups.repo };
}

export async function fetchGitHubSignals(repositoryUrl?: string): Promise<GitHubSignals> {
  const repo = parseGitHubRepoUrl(repositoryUrl);
  if (!repo) {
    return {};
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "snoop-cli",
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const [repoRes, commitsRes] = await Promise.all([
    fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}`, { headers }),
    fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/commits?per_page=1`, { headers }),
  ]);

  const out: GitHubSignals = {};

  if (repoRes.ok) {
    const repoJson = (await repoRes.json()) as { open_issues_count?: number };
    out.openIssues = repoJson.open_issues_count;
  }

  if (commitsRes.ok) {
    const commitsJson = (await commitsRes.json()) as Array<{
      commit?: { committer?: { date?: string } };
    }>;
    out.lastCommit = commitsJson[0]?.commit?.committer?.date;
  }

  return out;
}
