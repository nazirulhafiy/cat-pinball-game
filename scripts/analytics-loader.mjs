/**
 * The one analytics loader for Cat Balls.
 *
 * Emits a single inline script. Production hosts come from the registry.
 * `?internal=1` sets the registry cookie; `?internal=0` clears it and any
 * legacy names. Internal visits send GA4 `traffic_type: 'internal'` and skip
 * the Cloudflare beacon.
 */
import { pathToFileURL } from "node:url";

import {
  honourCookies,
  hostnames,
  loadAnalytics,
  primaryCfToken,
  primaryGa4Id,
} from "./analytics-registry.mjs";

/** Dist check counts this attribute. Exactly one per built page. */
export const ANALYTICS_LOADER_ATTR = "data-balls-analytics-loader";

/** ~1 year. Matches the fleet loader. */
const COOKIE_MAX_AGE = 31536000;

export function renderAnalyticsLoader(registry = loadAnalytics()) {
  const hostsJs = hostnames(registry)
    .map((host) => JSON.stringify(host))
    .join(",");
  const primary = JSON.stringify(registry.internal_cookie);
  const honour = honourCookies(registry)
    .map((name) => JSON.stringify(name))
    .join(",");
  const measurementId = JSON.stringify(primaryGa4Id(registry));
  const beacon = JSON.stringify({ token: primaryCfToken(registry), spa: registry.spa });

  return (
    `<script ${ANALYTICS_LOADER_ATTR}>` +
    "(function(){" +
    `var H=[${hostsJs}],h=location.hostname;` +
    "if(H.indexOf(h)<0)return;" +
    `var C=${primary},L=[${honour}],q=new URLSearchParams(location.search),` +
    "sec=location.protocol==='https:'?';Secure':'';" +
    "if(q.get('internal')==='1')" +
    `document.cookie=C+'=1;path=/;max-age=${COOKIE_MAX_AGE};SameSite=Lax'+sec;` +
    "else if(q.get('internal')==='0')" +
    "L.forEach(function(n){document.cookie=n+'=;path=/;max-age=0;SameSite=Lax'+sec;});" +
    "var internal=L.some(function(n){return document.cookie.split(';').some(function(p){" +
    "return p.trim()===n+'=1';});});" +
    "window.dataLayer=window.dataLayer||[];" +
    "function gtag(){dataLayer.push(arguments);}" +
    "window.gtag=gtag;" +
    "gtag('js',new Date());" +
    `var id=${measurementId},cfg={};` +
    "if(internal)cfg.traffic_type='internal';" +
    "gtag('config',id,cfg);" +
    "var gs=document.createElement('script');gs.async=true;" +
    "gs.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(id);" +
    "document.head.appendChild(gs);" +
    "if(internal)return;" +
    "var s=document.createElement('script');s.defer=true;" +
    "s.src='https://static.cloudflareinsights.com/beacon.min.js';" +
    `s.setAttribute('data-cf-beacon','${beacon}');` +
    "document.head.appendChild(s);" +
    "})();</script>"
  );
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  process.stdout.write(renderAnalyticsLoader());
}
