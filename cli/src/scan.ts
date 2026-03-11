import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Ecosystem } from "./types.js";

export interface ScannedPackage {
  name: string;
  version: string;
  ecosystem: Ecosystem;
}

export interface ProjectScan {
  ecosystem: Ecosystem;
  packages: ScannedPackage[];
  projectFile: string;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveInstalledVersion(nmPath: string, pkgName: string): Promise<string> {
  try {
    // scoped packages like @scope/name live under node_modules/@scope/name
    const pkgJsonPath = join(nmPath, pkgName, "package.json");
    const raw = await readFile(pkgJsonPath, "utf-8");
    const json = JSON.parse(raw) as { version?: string };
    return json.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function stripVersionPrefix(version: string): string {
  return version.replace(/^[\^~>=<*]+/, "").split(" ")[0] ?? "unknown";
}

async function scanNpm(dir: string): Promise<ProjectScan | null> {
  const pkgJsonPath = join(dir, "package.json");
  if (!(await fileExists(pkgJsonPath))) return null;

  let json: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    const raw = await readFile(pkgJsonPath, "utf-8");
    json = JSON.parse(raw) as typeof json;
  } catch {
    return null;
  }

  const allDeps: Record<string, string> = {
    ...(json.dependencies ?? {}),
    ...(json.devDependencies ?? {}),
  };

  if (Object.keys(allDeps).length === 0) return null;

  const nmPath = join(dir, "node_modules");
  const nmExists = await fileExists(nmPath);

  const packages: ScannedPackage[] = await Promise.all(
    Object.entries(allDeps).map(async ([name, version]) => {
      const resolvedVersion = nmExists
        ? await resolveInstalledVersion(nmPath, name)
        : stripVersionPrefix(version);
      return { name, version: resolvedVersion, ecosystem: "npm" as Ecosystem };
    }),
  );

  return { ecosystem: "npm", packages, projectFile: "package.json" };
}

function parseRequirementsTxt(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("-r") && !line.startsWith("--"))
    .map((line) => line.split(/[=><!~\[;@]/)[0].trim())
    .filter(Boolean);
}

function parsePyprojectToml(content: string): string[] {
  const deps: string[] = [];
  // Match the dependencies array under [project]
  const depsMatch = content.match(/\[project\][\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/);
  if (depsMatch) {
    const block = depsMatch[1];
    for (const line of block.split("\n")) {
      const clean = line.trim().replace(/^["']|["'],?\s*$/g, "");
      if (clean && !clean.startsWith("#")) {
        const name = clean.split(/[=><!~\[;@\s]/)[0].trim();
        if (name) deps.push(name);
      }
    }
  }
  return deps;
}

function parsePipfile(content: string): string[] {
  const deps: string[] = [];
  let inSection = false;
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "[packages]" || trimmed === "[dev-packages]") {
      inSection = true;
      continue;
    }
    if (trimmed.startsWith("[")) {
      inSection = false;
      continue;
    }
    if (inSection && trimmed && !trimmed.startsWith("#")) {
      const name = trimmed.split(/\s*=/)[0].trim();
      if (name) deps.push(name);
    }
  }
  return deps;
}

async function scanPip(dir: string): Promise<ProjectScan | null> {
  const candidates: Array<{ file: string; parser: (c: string) => string[] }> = [
    { file: "requirements.txt", parser: parseRequirementsTxt },
    { file: "pyproject.toml", parser: parsePyprojectToml },
    { file: "Pipfile", parser: parsePipfile },
    { file: "setup.cfg", parser: (c) => parseRequirementsTxt(c.replace(/^install_requires\s*=\s*/m, "")) },
  ];

  for (const { file, parser } of candidates) {
    const filePath = join(dir, file);
    if (!(await fileExists(filePath))) continue;
    try {
      const content = await readFile(filePath, "utf-8");
      const names = parser(content);
      if (names.length > 0) {
        return {
          ecosystem: "pip",
          packages: names.map((name) => ({ name, version: "latest", ecosystem: "pip" as Ecosystem })),
          projectFile: file,
        };
      }
    } catch {
      // skip unreadable files
    }
  }

  return null;
}

export async function scanDirectory(dir: string): Promise<ProjectScan[]> {
  const [npmResult, pipResult] = await Promise.all([scanNpm(dir), scanPip(dir)]);
  const results: ProjectScan[] = [];
  if (npmResult) results.push(npmResult);
  if (pipResult) results.push(pipResult);
  return results;
}
