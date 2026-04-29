#!/usr/bin/env node

/**
 * OpenImage 版本号管理脚本
 * 用法：npm run bump <VerNum | patch | minor | major>
 *
 * 同时更新以下 5 个文件的版本号：
 * - backend/pyproject.toml
 * - backend/src/server.py
 * - frontend/package.json
 * - frontend/src-tauri/Cargo.toml
 * - frontend/src-tauri/tauri.conf.json
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const FILES = [
  {
    path: "backend/pyproject.toml",
    pattern: /version\s*=\s*"(\d+\.\d+\.\d+)"/,
    replace: (v) => `version = "${v}"`,
  },
  {
    path: "backend/src/server.py",
    pattern: /version="(\d+\.\d+\.\d+)"/,
    replace: (v) => `version="${v}"`,
  },
  {
    path: "frontend/package.json",
    pattern: /"version"\s*:\s*"(\d+\.\d+\.\d+)"/,
    replace: (v) => `"version": "${v}"`,
  },
  {
    path: "frontend/src-tauri/Cargo.toml",
    pattern: /^version\s*=\s*"(\d+\.\d+\.\d+)"/m,
    replace: (v) => `version = "${v}"`,
  },
  {
    path: "frontend/src-tauri/tauri.conf.json",
    pattern: /"version"\s*:\s*"(\d+\.\d+\.\d+)"/,
    replace: (v) => `"version": "${v}"`,
  },
];

function parseSemver(v) {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) throw new Error(`Invalid version: ${v}`);
  return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
}

function formatSemver([major, minor, patch]) {
  return `${major}.${minor}.${patch}`;
}

function bumpVersion(current, action) {
  const parts = parseSemver(current);
  switch (action) {
    case "major":
      return formatSemver([parts[0] + 1, 0, 0]);
    case "minor":
      return formatSemver([parts[0], parts[1] + 1, 0]);
    case "patch":
      return formatSemver([parts[0], parts[1], parts[2] + 1]);
    default:
      // Validate the explicit version
      parseSemver(action);
      return action;
  }
}

// Read current version from the first file
function getCurrentVersion() {
  const content = readFileSync(resolve(ROOT, FILES[0].path), "utf-8");
  const match = content.match(FILES[0].pattern);
  if (!match) throw new Error(`Cannot find version in ${FILES[0].path}`);
  return match[1];
}

function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.log("Usage: npm run bump <VerNum | patch | minor | major>");
    console.log(`Current: ${getCurrentVersion()}`);
    process.exit(1);
  }

  const current = getCurrentVersion();
  const next = bumpVersion(current, arg);

  console.log(`Bumping: ${current} → ${next}\n`);

  for (const file of FILES) {
    const filePath = resolve(ROOT, file.path);
    let content = readFileSync(filePath, "utf-8");
    const match = content.match(file.pattern);
    if (!match) {
      console.warn(`  ⚠ No version found in ${file.path}`);
      continue;
    }
    if (match[1] !== current) {
      console.warn(
        `  ⚠ Version mismatch in ${file.path}: found ${match[1]}, expected ${current}`
      );
    }
    content = content.replace(file.pattern, file.replace(next));
    writeFileSync(filePath, content, "utf-8");
    console.log(`  ✓ ${file.path}`);
  }

  console.log(`\nDone! Version updated to ${next}`);
  console.log("Run `npm install` to sync package-lock.json");
}

main();
