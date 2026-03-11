function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function daysAgo(dateIso: string): number {
  const now = Date.now();
  const then = new Date(dateIso).getTime();
  if (Number.isNaN(then)) {
    return 3650;
  }
  return (now - then) / (1000 * 60 * 60 * 24);
}

export function computeHealthScore(input: {
  weeklyDownloads: number;
  lastPublished: string;
  githubLastCommit?: string;
  githubOpenIssues?: number;
}): number {
  let score = 50;

  if (input.weeklyDownloads > 10_000_000) {
    score += 20;
  } else if (input.weeklyDownloads > 1_000_000) {
    score += 12;
  } else if (input.weeklyDownloads > 100_000) {
    score += 8;
  } else if (input.weeklyDownloads > 10_000) {
    score += 4;
  }

  const publishedDays = daysAgo(input.lastPublished);
  if (publishedDays < 30) {
    score += 15;
  } else if (publishedDays < 90) {
    score += 10;
  } else if (publishedDays < 180) {
    score += 5;
  } else if (publishedDays > 365) {
    score -= 12;
  }

  if (input.githubLastCommit) {
    const commitDays = daysAgo(input.githubLastCommit);
    if (commitDays < 30) {
      score += 10;
    } else if (commitDays > 365) {
      score -= 10;
    }
  }

  if (typeof input.githubOpenIssues === "number") {
    if (input.githubOpenIssues > 1500) {
      score -= 12;
    } else if (input.githubOpenIssues > 300) {
      score -= 7;
    } else if (input.githubOpenIssues < 50) {
      score += 5;
    }
  }

  return Math.round(clamp(score, 0, 100));
}
