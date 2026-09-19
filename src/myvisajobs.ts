import fs from "fs";
import path from "path";
import { normalizeCompanyName } from "./sponsors";

const CACHE_PATH = path.join(__dirname, "..", "data", "myvisajobs-cache.json");
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

export interface MyVisaJobsRecord {
  matchedName: string;
  url: string;
  visaRank: string | null;
  h1bDeniedOrWithdrawn: number | null;
  h1bTotal: number | null;
  gcDeniedOrWithdrawn: number | null;
  gcTotal: number | null;
}

interface CacheEntry {
  record: MyVisaJobsRecord | null;
  fetchedAt: string;
}

interface ParsedRow {
  rank: string;
  slug: string;
  name: string;
  h1b: string;
  gc: string;
}

function parseRows(html: string): ParsedRow[] {
  const listMatch = html.match(/id="ctl00_ContentPlaceHolder1_lblResultList">([\s\S]*?)<\/span>/);
  if (!listMatch) return [];
  const rowRegex =
    /<tr>\s*<td>\d+<\/td>\s*<td>([^<]*)<\/td>\s*<td[^>]*><a href='([^']*)'[^>]*>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<\/tr>/g;
  const rows: ParsedRow[] = [];
  let m: RegExpExecArray | null;
  while ((m = rowRegex.exec(listMatch[1]))) {
    rows.push({ rank: m[1], slug: m[2], name: m[3].trim(), h1b: m[4], gc: m[5] });
  }
  return rows;
}

function parseFraction(s: string): [number | null, number | null] {
  if (!s || s === "-") return [null, null];
  const [a, b] = s.split("/").map(Number);
  return [Number.isFinite(a) ? a : null, Number.isFinite(b) ? b : null];
}

function wordSet(name: string): Set<string> {
  return new Set(normalizeCompanyName(name).split(" ").filter((w) => w.length >= 3));
}

function pickBestRow(rows: ParsedRow[], companyName: string): ParsedRow | undefined {
  const key = normalizeCompanyName(companyName);
  const exact = rows.find((r) => normalizeCompanyName(r.name) === key);
  if (exact) return exact;

  const keyWords = wordSet(companyName);
  if (keyWords.size === 0) return undefined;
  return rows.find((r) => {
    const rowWords = wordSet(r.name);
    if (rowWords.size === 0) return false;
    const [smaller, larger] = keyWords.size <= rowWords.size ? [keyWords, rowWords] : [rowWords, keyWords];
    for (const w of smaller) if (!larger.has(w)) return false;
    return true;
  });
}

/** Queries myvisajobs.com's public employer search (not gated by login or the
 * Cloudflare check that protects individual employer detail pages) for H-1B/green
 * card sponsorship history over the last three fiscal years. */
async function fetchFromMyVisaJobs(companyName: string): Promise<MyVisaJobsRecord | null> {
  const url = `https://www.myvisajobs.com/employers/search.aspx?e=${encodeURIComponent(companyName)}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;
  const html = await res.text();
  const rows = parseRows(html);
  const best = pickBestRow(rows, companyName);
  if (!best) return null;

  const [h1bDeniedOrWithdrawn, h1bTotal] = parseFraction(best.h1b);
  const [gcDeniedOrWithdrawn, gcTotal] = parseFraction(best.gc);
  return {
    matchedName: best.name,
    url: `https://www.myvisajobs.com${best.slug}`,
    visaRank: best.rank === "-" ? null : best.rank,
    h1bDeniedOrWithdrawn,
    h1bTotal,
    gcDeniedOrWithdrawn,
    gcTotal,
  };
}

function readCache(): Record<string, CacheEntry> {
  if (!fs.existsSync(CACHE_PATH)) return {};
  return JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
}

function writeCache(cache: Record<string, CacheEntry>): void {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Looks up a company's H-1B/green card sponsorship history on myvisajobs.com,
 * caching results on disk (data/myvisajobs-cache.json) so repeat runs don't
 * re-hit their server. Waits `delayMs` before any live network request to stay
 * a courteous, low-rate caller. */
export async function lookupMyVisaJobs(
  companyName: string,
  delayMs = 500,
): Promise<MyVisaJobsRecord | null> {
  const cache = readCache();
  const key = normalizeCompanyName(companyName);
  const cached = cache[key];
  if (cached) return cached.record;

  await sleep(delayMs);
  const record = await fetchFromMyVisaJobs(companyName);
  cache[key] = { record, fetchedAt: new Date().toISOString() };
  writeCache(cache);
  return record;
}
