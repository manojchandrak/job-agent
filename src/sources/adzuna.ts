import type { JobListing } from "../types";

interface AdzunaJob {
  id: string;
  title: string;
  company: { display_name: string };
  location: { display_name: string };
  redirect_url: string;
  created: string;
}

const PAGES = 3;
const RESULTS_PER_PAGE = 50;

function tokenize(keywords: string[]): string {
  const stopwords = new Set(["senior", "lead", "and", "the"]);
  const tokens = new Set<string>();
  for (const phrase of keywords) {
    for (const word of phrase.split(/[\s.\-]+/)) {
      const lower = word.toLowerCase();
      if (lower.length > 1 && !stopwords.has(lower)) tokens.add(lower);
    }
  }
  return [...tokens].join(" ");
}

/**
 * Requires a free API key from https://developer.adzuna.com (App ID + App key).
 * Aggregates listings across many US job boards, remote and onsite.
 */
export async function fetchAdzuna(
  appId: string,
  appKey: string,
  keywords: string[] = [],
): Promise<JobListing[]> {
  const fetchedAt = new Date().toISOString();
  const whatOr = tokenize(keywords);
  const requests: Promise<JobListing[]>[] = [];

  for (let page = 1; page <= PAGES; page++) {
    requests.push(fetchAdzunaPage(appId, appKey, page, whatOr, fetchedAt));
  }

  const pages = await Promise.all(requests);
  const byId = new Map<string, JobListing>();
  for (const job of pages.flat()) byId.set(job.id, job);
  return [...byId.values()];
}

async function fetchAdzunaPage(
  appId: string,
  appKey: string,
  page: number,
  whatOr: string,
  fetchedAt: string,
): Promise<JobListing[]> {
  const url =
    `https://api.adzuna.com/v1/api/jobs/us/search/${page}` +
    `?app_id=${encodeURIComponent(appId)}&app_key=${encodeURIComponent(appKey)}` +
    `&results_per_page=${RESULTS_PER_PAGE}&content-type=application/json` +
    (whatOr ? `&what_or=${encodeURIComponent(whatOr)}` : "");
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[adzuna] page ${page}: ${res.status} ${res.statusText}`);
    return [];
  }
  const data = (await res.json()) as { results: AdzunaJob[] };
  return (data.results ?? []).map((job) => ({
    id: `adzuna:${job.id}`,
    source: "adzuna" as const,
    company: job.company?.display_name ?? "Unknown",
    title: job.title,
    location: job.location?.display_name ?? "Unknown",
    url: job.redirect_url,
    postedAt: job.created ?? null,
    fetchedAt,
  }));
}
