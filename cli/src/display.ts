import chalk from "chalk";
import type { AnalyzeResponse, VulnSeverity } from "./types.js";

function severityColor(sev: VulnSeverity): (text: string) => string {
  switch (sev) {
    case "CRITICAL": return (t) => chalk.bgRed.bold(t);
    case "HIGH":     return (t) => chalk.red.bold(t);
    case "MEDIUM":   return (t) => chalk.yellow(t);
    case "LOW":      return (t) => chalk.blue(t);
    default:         return (t) => chalk.gray(t);
  }
}

function formatDownloads(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B/week`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M/week`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K/week`;
  }
  return `${value}/week`;
}

function padRight(text: string, width: number): string {
  if (text.length >= width) {
    return text.slice(0, width);
  }
  return text + " ".repeat(width - text.length);
}

function wrapLine(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > width) {
      if (current) {
        lines.push(current);
      }
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : [""];
}

export function renderCard(data: AnalyzeResponse): void {
  const width = 62;
  const inner = width - 2;

  const title = `${data.package} @${data.version} (${data.ecosystem})`;
  const licenseLine = `${data.license_risk ? "!" : "OK"} License: ${data.license_type}`;
  const depsLine = `Deps: ${data.dep_count} | Install size: ~${data.install_size_kb} KB`;
  const healthLine = `Health: ${data.health_score}/100`;
  const downloadsLine = `Downloads: ${formatDownloads(data.weekly_downloads)}`;

  const out: string[] = [];
  out.push(chalk.cyan("┌" + "─".repeat(inner) + "┐"));
  out.push(chalk.cyan(`│${padRight(`  ${title}`, inner)}│`));
  out.push(chalk.cyan("├" + "─".repeat(inner) + "┤"));

  out.push(chalk.cyan(`│${padRight("  What it does", inner)}│`));
  for (const line of wrapLine(data.summary, inner - 4)) {
    out.push(chalk.cyan(`│${padRight(`  ${line}`, inner)}│`));
  }

  out.push(chalk.cyan(`│${padRight("", inner)}│`));
  out.push(chalk.cyan(`│${padRight(`  ${licenseLine}`, inner)}│`));
  out.push(chalk.cyan(`│${padRight(`  ${depsLine}`, inner)}│`));
  out.push(chalk.cyan(`│${padRight(`  ${healthLine}`, inner)}│`));
  out.push(chalk.cyan(`│${padRight(`  ${downloadsLine}`, inner)}│`));

  out.push(chalk.cyan(`│${padRight("", inner)}│`));
  out.push(chalk.cyan(`│${padRight("  Alternatives", inner)}│`));

  for (const alt of data.alternatives.slice(0, 3)) {
    const lines = wrapLine(`- ${alt.name} - ${alt.comparison}`, inner - 4);
    for (const line of lines) {
      out.push(chalk.cyan(`│${padRight(`  ${line}`, inner)}│`));
    }
  }

  if (!data.alternatives.length) {
    out.push(chalk.cyan(`│${padRight("  - No alternatives suggested", inner)}│`));
  }

  // ── Vulnerabilities ──────────────────────────────────────────────────────
  out.push(chalk.cyan(`│${padRight("", inner)}│`));

  const vulns = data.vulnerabilities ?? [];
  if (!vulns.length) {
    out.push(chalk.cyan(`│${padRight("  Vulnerabilities: ", inner)}│`));
    out.push(chalk.cyan(`│`) + chalk.green(padRight("  ✔ No known vulnerabilities", inner)) + chalk.cyan(`│`));
  } else {
    const unpatched = vulns.filter((v) => !v.patched);
    const patched   = vulns.filter((v) => v.patched);
    const critCount = unpatched.filter((v) => v.severity === "CRITICAL").length;
    const highCount = unpatched.filter((v) => v.severity === "HIGH").length;
    const header =
      `  Vulnerabilities: ${unpatched.length} active, ${patched.length} historical` +
      (critCount ? `  ${critCount} CRITICAL` : "") +
      (highCount ? `  ${highCount} HIGH` : "");
    out.push(chalk.cyan(`│`) + chalk.red.bold(padRight(header, inner)) + chalk.cyan(`│`));
    for (const v of vulns.slice(0, 5)) {
      const colorize = severityColor(v.severity);
      const badge = colorize(`[${v.severity}]`);
      const statusTag = v.patched ? chalk.green("[PATCHED]") : chalk.red("[ACTIVE]");
      const fixNote = v.fixed_version ? ` → fix: ${v.fixed_version}` : "";
      const prefix = `  ${v.id}${fixNote}`;
      out.push(chalk.cyan(`│`) + chalk.white(padRight(prefix, inner)) + chalk.cyan(`│`));
      for (const line of wrapLine(`    ${badge} ${statusTag} ${v.summary}`, inner - 4)) {
        out.push(chalk.cyan(`│${padRight(`  ${line}`, inner)}│`));
      }
    }
    if (vulns.length > 5) {
      out.push(chalk.cyan(`│${padRight(`  ...and ${vulns.length - 5} more`, inner)}│`));
    }
  }

  out.push(chalk.cyan("└" + "─".repeat(inner) + "┘"));

  console.log(out.join("\n"));
}
