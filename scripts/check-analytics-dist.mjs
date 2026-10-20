#!/usr/bin/env node
/**
 * Fail if a built page's analytics loader drifts from data/analytics.json.
 *
 * Each HTML page under dist/ (the Pages output) must have exactly one
 * analytics loader. A loader is a `<script data-balls-analytics-loader>` or a
 * hand-typed gtag/Cloudflare beacon script. GA4 ids on the page must be in
 * the registry. Cookie names must be the registry `internal_cookie` or a
 * per-host `legacy_internal_cookies` entry.
 *
 * Default: check every `*.html` file under `dist/`.
 * `--dist <dir>` checks that directory instead (used to prove a seeded
 * failure without committing it).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  cfTokens,
  ga4Ids,
  honourCookies,
  loadAnalytics,
  REGISTRY_PATH,
} from "./analytics-registry.mjs";
import { ANALYTICS_LOADER_ATTR } from "./analytics-loader.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DIST = join(ROOT, "dist");

const LOADER_ATTR = ANALYTICS_LOADER_ATTR;
const GA4_RE = /\bG-[A-Z0-9]+\b/g;
const SCRIPT_RE = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
const PRIMARY_COOKIE_RE = /(?:\bvar\s+C|\bC)\s*=\s*(["'])([A-Za-z0-9_-]+)\1/g;
const LEGACY_LIST_RE = /\bL\s*=\s*\[(.*?)\]/gs;
const QUOTED_NAME_RE = /(["'])([A-Za-z0-9_-]+)\1/g;
const STRAY_COOKIE_RE =
  /document\.cookie\s*=\s*(["'])([A-Za-z0-9_-]+)\1|(["'])([A-Za-z0-9_-]+)\3\s*\+\s*['"]=1['"]|indexOf\(\s*(["'])([A-Za-z0-9_-]+)\5\s*\+\s*['"]=1['"]\)/g;
const BEACON_TOKEN_RE = /"token"\s*:\s*"([a-f0-9]{32})"/g;

function isAnalyticsScript(block) {
  const lower = block.toLowerCase();
  if (lower.includes(LOADER_ATTR)) return true;
  if (/<script\b[^>]*\bsrc\s*=\s*['"][^'"]*googletagmanager\.com\/gtag\/js/i.test(block)) {
    return true;
  }
  if (/<script\b[^>]*\bsrc\s*=\s*['"][^'"]*cloudflareinsights\.com\/beacon/i.test(block)) {
    return true;
  }
  if (/<script\b[^>]*\bdata-cf-beacon\s*=/i.test(block)) return true;
  if (/gtag\(\s*['"]config['"]/.test(block)) return true;
  return false;
}

function cookieNames(html, blocks) {
  const found = new Set();
  const sources = blocks.length > 0 ? blocks : [html];
  for (const block of sources) {
    for (const match of block.matchAll(PRIMARY_COOKIE_RE)) found.add(match[2]);
    for (const list of block.matchAll(LEGACY_LIST_RE)) {
      for (const quoted of list[1].matchAll(QUOTED_NAME_RE)) found.add(quoted[2]);
    }
  }
  if (
    html.includes("traffic_type") ||
    html.includes("cloudflareinsights.com/beacon") ||
    html.includes(LOADER_ATTR)
  ) {
    for (const match of html.matchAll(STRAY_COOKIE_RE)) {
      const name = match[2] || match[4] || match[6];
      if (name) found.add(name);
    }
  }
  return found;
}

/**
 * @param {string} rel
 * @param {string} html
 * @param {ReturnType<typeof loadAnalytics>} registry
 * @returns {string[]}
 */
export function checkHtml(rel, html, registry) {
  const errors = [];
  const scripts = html.match(SCRIPT_RE) ?? [];
  const loaders = scripts.filter(isAnalyticsScript);
  if (loaders.length === 0) {
    errors.push(`${rel}: zero analytics loaders (missing ${LOADER_ATTR})`);
    return errors;
  }
  if (loaders.length !== 1) {
    errors.push(`${rel}: ${loaders.length} analytics loaders (want exactly one ${LOADER_ATTR})`);
  }

  const handTyped = loaders.filter((block) => !block.toLowerCase().includes(LOADER_ATTR));
  if (handTyped.length > 0) {
    errors.push(
      `${rel}: hand-typed gtag/CF beacon (${handTyped.length} script(s) without ${LOADER_ATTR})`,
    );
  }

  const allowedIds = new Set(ga4Ids(registry));
  const pageIds = new Set(html.match(GA4_RE) ?? []);
  for (const id of [...pageIds].sort()) {
    if (!allowedIds.has(id)) errors.push(`${rel}: GA4 id '${id}' not in data/analytics.json`);
  }

  const mentionsBeacon =
    html.includes("cloudflareinsights.com/beacon") || html.includes("data-cf-beacon");
  if (mentionsBeacon) {
    const allowedTokens = new Set(cfTokens(registry));
    const tokens = new Set([...html.matchAll(BEACON_TOKEN_RE)].map((match) => match[1]));
    for (const token of [...tokens].sort()) {
      if (!allowedTokens.has(token)) {
        errors.push(`${rel}: CF beacon token '${token}' not in data/analytics.json`);
      }
    }
    const spaValues = [...html.matchAll(/"spa"\s*:\s*(true|false)/g)].map((match) => match[1]);
    const want = registry.spa ? "true" : "false";
    if (spaValues.length === 0 || spaValues.some((value) => value !== want)) {
      errors.push(`${rel}: registry spa is ${registry.spa} but CF beacon spa drifts`);
    }
  }

  const allowedCookies = new Set(honourCookies(registry));
  const found = cookieNames(html, loaders);
  for (const name of [...found].sort()) {
    if (!allowedCookies.has(name)) {
      errors.push(
        `${rel}: cookie name '${name}' is not registry internal_cookie ` +
          `(${registry.internal_cookie}) or legacy_internal_cookies`,
      );
    }
  }
  if (!found.has(registry.internal_cookie)) {
    errors.push(
      `${rel}: missing registry cookie '${registry.internal_cookie}' ` +
        `(found ${[...found].sort().join(", ") || "none"})`,
    );
  }
  return errors;
}

export function htmlPages(dir) {
  /** @type {string[]} */
  const pages = [];
  const walk = (current) => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      const stat = statSync(path);
      if (stat.isDirectory()) walk(path);
      else if (name.endsWith(".html")) pages.push(path);
    }
  };
  walk(dir);
  pages.sort();
  return pages;
}

function parseArgs(argv) {
  /** @type {{ dist: string, registry: string }} */
  const args = { dist: DEFAULT_DIST, registry: REGISTRY_PATH };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dist") {
      args.dist = argv[i + 1] ?? "";
      i += 1;
    } else if (arg === "--registry") {
      args.registry = argv[i + 1] ?? "";
      i += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

export function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 2;
  }

  let registry;
  try {
    registry = loadAnalytics(args.registry);
  } catch (error) {
    console.error(`Analytics dist check FAILED: ${error instanceof Error ? error.message : error}`);
    return 1;
  }

  if (!existsSync(args.dist) || !statSync(args.dist).isDirectory()) {
    console.error(`Analytics dist check FAILED: dist directory missing: ${args.dist}`);
    return 1;
  }
  const files = htmlPages(args.dist);
  if (files.length === 0) {
    console.error(`Analytics dist check FAILED: no HTML pages under ${args.dist}`);
    return 1;
  }

  const errors = files.flatMap((file) => {
    const rel = relative(args.dist, file) || file;
    return checkHtml(rel, readFileSync(file, "utf8"), registry);
  });
  if (errors.length > 0) {
    console.error("Analytics dist check FAILED:");
    for (const error of errors) console.error(`  ${error}`);
    return 1;
  }

  console.log(
    `Analytics dist check OK: ${files.length} page(s), ` +
      `cookie=${JSON.stringify(registry.internal_cookie)}, spa=${registry.spa}, ` +
      `ga4=${JSON.stringify(ga4Ids(registry))}, hosts=${JSON.stringify(Object.keys(registry.hosts))}`,
  );
  return 0;
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  process.exit(main());
}
