import chalk from "chalk";
import type { AnalyzeResponse } from "./types.js";

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

  out.push(chalk.cyan("└" + "─".repeat(inner) + "┘"));

  console.log(out.join("\n"));
}
