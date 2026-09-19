import type { JobListing } from "../types";

interface MuseJob {
  id: number;
  name: string;
  refs: { landing_page: string };
  publication_date: string;
  company: { name: string };
  locations: { name: string }[];
}

const CATEGORIES = ["Software Engineering", "Data Science", "Engineering"];
const PAGES_PER_CATEGORY = 2;

const NON_US_SIGNALS =
  /india|australia|new zealand|mexico|canada|united kingdom|\buk\b|germany|france|brazil|argentina|philippines|poland|ireland|singapore|\bchina\b|japan|bangalore|chennai|hyderabad|mumbai|delhi|sydney|auckland|london|toronto|berlin|dublin/i;
const US_SIGNALS = /united states|\busa\b/i;
// Muse city/state entries look like "New York, NY" — a two-letter code after a comma.
const US_STATE_SUFFIX = /,\s*[A-Z]{2}\b/;

/** The Muse's location strings are free text; this is a best-effort US filter, not exact. */
function isLikelyUS(location: string): boolean {
  if (NON_US_SIGNALS.test(location)) return false;
  if (US_SIGNALS.test(location) || US_STATE_SUFFIX.test(location)) return true;
  // No city/country signal at all (e.g. just "Flexible / Remote") — Muse skews US, so include it.
  return true;
}

/** No API key required for The Muse's public jobs endpoint. */
export async function fetchMuse(): Promise<JobListing[]> {
  const fetchedAt = new Date().toISOString();
  const requests: Promise<JobListing[]>[] = [];

  for (const category of CATEGORIES) {
    for (let page = 0; page < PAGES_PER_CATEGORY; page++) {
      requests.push(fetchMusePage(category, page, fetchedAt));
    }
  }

  const pages = await Promise.all(requests);
  const byId = new Map<string, JobListing>();
  for (const job of pages.flat()) byId.set(job.id, job);
  return [...byId.values()];
}

async function fetchMusePage(
  category: string,
  page: number,
  fetchedAt: string,
): Promise<JobListing[]> {
  const url = `https://www.themuse.com/api/public/jobs?category=${encodeURIComponent(category)}&page=${page}&location=United%20States`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[muse] ${category} p${page}: ${res.status} ${res.statusText}`);
    return [];
  }
  const data = (await res.json()) as { results: MuseJob[] };
  return (data.results ?? [])
    .map((job) => ({
      id: `muse:${job.id}`,
      source: "muse" as const,
      company: job.company?.name ?? "Unknown",
      title: job.name,
      location: job.locations?.map((l) => l.name).join(", ") || "Unknown",
      url: job.refs?.landing_page,
      postedAt: job.publication_date ?? null,
      fetchedAt,
    }))
    .filter((job) => isLikelyUS(job.location));
}
