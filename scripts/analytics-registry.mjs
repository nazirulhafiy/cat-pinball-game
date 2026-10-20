/**
 * Typed view of data/analytics.json (fleet registry, version 1).
 *
 * One internal cookie, a spa flag, and per-host GA4 id, Cloudflare Web
 * Analytics token, aliases, and legacy cookie names. The loader and the dist
 * check both read this module. Do not hard-code ids beside it.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const REGISTRY_PATH = join(ROOT, "data", "analytics.json");

const GA4_ID_RE = /^G-[A-Z0-9]+$/;
const CF_TOKEN_RE = /^[a-f0-9]{32}$/;
const HOST_RE = /^[a-z0-9.-]+$/;
const COOKIE_RE = /^[A-Za-z0-9_-]+$/;

const TOP_LEVEL_KEYS = ["version", "internal_cookie", "spa", "hosts"];
const HOST_ENTRY_KEYS = [
  "ga4_measurement_id",
  "cf_beacon_token",
  "aliases",
  "legacy_internal_cookies",
];

function fail(message) {
  const error = new Error(`analytics registry: ${message}`);
  error.registry = true;
  throw error;
}

function exactKeys(obj, allowed, path) {
  const keys = Object.keys(obj);
  const unknown = keys.filter((key) => !allowed.includes(key)).sort();
  const missing = allowed.filter((key) => !keys.includes(key)).sort();
  if (unknown.length > 0) fail(`${path}: unknown keys: ${unknown.join(", ")}`);
  if (missing.length > 0) fail(`${path}: missing keys: ${missing.join(", ")}`);
}

function requireString(value, path) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${path} must be a non-empty string`);
  }
  return value.trim();
}

function requireStringList(value, path) {
  if (!Array.isArray(value)) fail(`${path} must be an array of strings`);
  return value.map((item, index) => requireString(item, `${path}[${index}]`));
}

/** Validate the fleet registry shape. Returns the typed registry. */
export function validateAnalytics(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    fail("registry must be a JSON object");
  }
  exactKeys(payload, TOP_LEVEL_KEYS, "registry");
  if (payload.version !== 1) fail(`version must be 1, got ${String(payload.version)}`);

  const internalCookie = requireString(payload.internal_cookie, "internal_cookie");
  if (!COOKIE_RE.test(internalCookie)) {
    fail(`internal_cookie has invalid characters: ${internalCookie}`);
  }
  if (typeof payload.spa !== "boolean") fail("spa must be a boolean");

  if (payload.hosts === null || typeof payload.hosts !== "object" || Array.isArray(payload.hosts)) {
    fail("hosts must be a non-empty object keyed by hostname");
  }
  const hostEntries = Object.entries(payload.hosts);
  if (hostEntries.length === 0) fail("hosts must be a non-empty object keyed by hostname");

  /** @type {Record<string, { ga4_measurement_id: string, cf_beacon_token: string, aliases: string[], legacy_internal_cookies: string[] }>} */
  const hosts = {};
  const seen = new Set();
  for (const [host, entry] of hostEntries) {
    if (!HOST_RE.test(host)) fail(`invalid host key ${host}`);
    if (seen.has(host)) fail(`duplicate hostname ${host}`);
    seen.add(host);
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      fail(`hosts[${host}] must be an object`);
    }
    const entryPath = `hosts[${host}]`;
    exactKeys(entry, HOST_ENTRY_KEYS, entryPath);

    const ga4 = requireString(entry.ga4_measurement_id, `${entryPath}.ga4_measurement_id`);
    if (!GA4_ID_RE.test(ga4)) fail(`${entryPath}.ga4_measurement_id invalid: ${ga4}`);
    const token = requireString(entry.cf_beacon_token, `${entryPath}.cf_beacon_token`);
    if (!CF_TOKEN_RE.test(token)) fail(`${entryPath}.cf_beacon_token invalid`);

    const aliases = requireStringList(entry.aliases, `${entryPath}.aliases`);
    for (const alias of aliases) {
      if (!HOST_RE.test(alias)) fail(`${entryPath}.aliases invalid: ${alias}`);
      if (alias === host) fail(`${entryPath}.aliases must not repeat the primary host`);
      if (seen.has(alias)) fail(`duplicate hostname via aliases: ${alias}`);
      seen.add(alias);
    }

    const legacy = requireStringList(
      entry.legacy_internal_cookies,
      `${entryPath}.legacy_internal_cookies`,
    );
    for (const name of legacy) {
      if (!COOKIE_RE.test(name)) {
        fail(`${entryPath}.legacy_internal_cookies has invalid characters: ${name}`);
      }
    }

    hosts[host] = {
      ga4_measurement_id: ga4,
      cf_beacon_token: token,
      aliases,
      legacy_internal_cookies: legacy,
    };
  }

  return {
    version: 1,
    internal_cookie: internalCookie,
    spa: payload.spa,
    hosts,
  };
}

export function loadAnalytics(path = REGISTRY_PATH) {
  let payload;
  try {
    payload = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`cannot read ${path}: ${error instanceof Error ? error.message : error}`);
  }
  return validateAnalytics(payload);
}

/** Primary host keys, then each alias, in registry order. */
export function hostnames(registry = loadAnalytics()) {
  const names = [];
  for (const [host, entry] of Object.entries(registry.hosts)) {
    for (const name of [host, ...entry.aliases]) {
      if (!names.includes(name)) names.push(name);
    }
  }
  return names;
}

/** Primary internal cookie, then unique per-host legacy names. */
export function honourCookies(registry = loadAnalytics()) {
  const names = [];
  const legacy = Object.values(registry.hosts).flatMap((entry) => entry.legacy_internal_cookies);
  for (const name of [registry.internal_cookie, ...legacy]) {
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

export function ga4Ids(registry = loadAnalytics()) {
  return uniqueSorted(Object.values(registry.hosts).map((entry) => entry.ga4_measurement_id));
}

export function cfTokens(registry = loadAnalytics()) {
  return uniqueSorted(Object.values(registry.hosts).map((entry) => entry.cf_beacon_token));
}

/** This build emits one measurement id. */
export function primaryGa4Id(registry = loadAnalytics()) {
  const ids = ga4Ids(registry);
  if (ids.length !== 1) {
    fail(`expected one GA4 measurement id for this site build, got ${ids.join(", ") || "(none)"}`);
  }
  return ids[0];
}

/** This build emits one Cloudflare beacon token. */
export function primaryCfToken(registry = loadAnalytics()) {
  const tokens = cfTokens(registry);
  if (tokens.length !== 1) {
    fail(
      `expected one CF beacon token for this site build, got ${tokens.length} distinct tokens`,
    );
  }
  return tokens[0];
}
