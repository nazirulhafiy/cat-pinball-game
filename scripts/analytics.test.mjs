import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ANALYTICS_LOADER_ATTR, renderAnalyticsLoader } from "./analytics-loader.mjs";
import { loadAnalytics } from "./analytics-registry.mjs";
import { checkHtml, main } from "./check-analytics-dist.mjs";

const registry = loadAnalytics();
const loader = renderAnalyticsLoader(registry);

function page(body) {
  return `<!DOCTYPE html><html><head>${body}</head><body></body></html>`;
}

test("repo registry keeps polah.app ids and the shared internal cookie", () => {
  assert.equal(registry.version, 1);
  assert.equal(registry.internal_cookie, "sn_internal");
  assert.equal(registry.spa, false);
  assert.deepEqual(Object.keys(registry.hosts), ["polah.app"]);
  const host = registry.hosts["polah.app"];
  assert.equal(host.ga4_measurement_id, "G-B3BZXWWDH9");
  assert.equal(host.cf_beacon_token, "cd795175569a442ca30e7c08a6295f9f");
  assert.deepEqual(host.aliases, ["www.polah.app"]);
  assert.deepEqual(host.legacy_internal_cookies, []);
});

test("loader is one script and does not count hafiy.my or localhost", () => {
  assert.equal(loader.split(ANALYTICS_LOADER_ATTR).length - 1, 1);
  assert.match(loader, /"polah\.app"/);
  assert.match(loader, /"www\.polah\.app"/);
  assert.match(loader, /sn_internal/);
  assert.match(loader, /G-B3BZXWWDH9/);
  assert.match(loader, /cd795175569a442ca30e7c08a6295f9f/);
  assert.match(loader, /"spa":false/);
  assert.match(loader, /q\.get\('internal'\)==='1'/);
  assert.match(loader, /q\.get\('internal'\)==='0'/);
  assert.match(loader, /max-age=31536000/);
  assert.match(loader, /traffic_type/);
  assert.doesNotMatch(loader, /hafiy\.my/);
  assert.doesNotMatch(loader, /localhost/);
  assert.doesNotMatch(loader, /github\.io/);
  assert.doesNotMatch(loader, /<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js/);
});

test("source index.html keeps the origin redirect and has no hand-typed tag", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(
    html,
    /location\.replace\('https:\/\/polah\.app' \+ path \+ location\.search \+ location\.hash\)/,
  );
  assert.match(html, /host !== 'hafiy\.my' && host !== 'nazirulhafiy\.github\.io'/);
  assert.doesNotMatch(html, /googletagmanager\.com\/gtag\/js/);
  assert.doesNotMatch(html, /data-cf-beacon/);
  assert.doesNotMatch(html, /cloudflareinsights\.com/);
  assert.equal(html.includes(ANALYTICS_LOADER_ATTR), false);
});

test("one registry loader passes", () => {
  assert.deepEqual(checkHtml("index.html", page(loader), registry), []);
});

test("zero loaders fails and names the file", () => {
  const errors = checkHtml("index.html", page(""), registry);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /index\.html: zero analytics loaders/);
});

test("two loaders fails", () => {
  const errors = checkHtml("index.html", page(loader + loader), registry);
  assert.ok(errors.some((error) => /2 analytics loaders/.test(error)), errors.join("\n"));
});

test("an id that is not in the registry fails", () => {
  const bad = loader.replaceAll("G-B3BZXWWDH9", "G-NOTINREGISTRY");
  const errors = checkHtml("index.html", page(bad), registry);
  assert.ok(errors.some((error) => error.includes("G-NOTINREGISTRY")), errors.join("\n"));
});

test("the wrong cookie fails", () => {
  const bad = loader.replaceAll("sn_internal", "ga_internal");
  const errors = checkHtml("index.html", page(bad), registry);
  assert.ok(errors.some((error) => error.includes("ga_internal")), errors.join("\n"));
  assert.ok(errors.some((error) => error.includes("missing registry cookie")), errors.join("\n"));
});

test("a hand-typed gtag fails even when the id is in the registry", () => {
  const hand = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-B3BZXWWDH9"></script><script>function gtag(){dataLayer.push(arguments);}gtag('config','G-B3BZXWWDH9');</script>`;
  const errors = checkHtml("index.html", page(loader + hand), registry);
  assert.ok(errors.some((error) => /analytics loaders/.test(error)), errors.join("\n"));
  assert.ok(errors.some((error) => /hand-typed gtag\/CF beacon/.test(error)), errors.join("\n"));
});

test("a hand-typed Cloudflare beacon fails", () => {
  const hand = `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","spa":true}'></script>`;
  const errors = checkHtml("index.html", page(hand), registry);
  assert.ok(errors.some((error) => /hand-typed gtag\/CF beacon/.test(error)), errors.join("\n"));
  assert.ok(errors.some((error) => error.includes("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")), errors.join("\n"));
  assert.ok(errors.some((error) => /spa drifts/.test(error)), errors.join("\n"));
  assert.ok(errors.some((error) => /missing registry cookie/.test(error)), errors.join("\n"));
});

test("main --dist fails on a seeded page and passes when the seed is gone", () => {
  const badDir = mkdtempSync(join(tmpdir(), "analytics-bad-"));
  const goodDir = mkdtempSync(join(tmpdir(), "analytics-good-"));
  const hand =
    `<script async src="https://www.googletagmanager.com/gtag/js?id=G-NOTINREGISTRY"></script>` +
    `<script>function gtag(){dataLayer.push(arguments);}gtag('config','G-NOTINREGISTRY');document.cookie="ga_internal=1";</script>`;
  writeFileSync(join(badDir, "index.html"), page(loader + hand));
  writeFileSync(join(goodDir, "index.html"), page(loader));
  assert.equal(main(["--dist", badDir]), 1);
  assert.equal(main(["--dist", goodDir]), 0);
});
