import type { JobListing } from "../types";

interface RemoteOkJob {
  id: string;
  position: string;
  company: string;
  location?: string;
  url: string;
  date: string;
}

export async function fetchRemoteOk(): Promise<JobListing[]> {
  const res = await fetch("https://remoteok.com/api", {
    headers: { "User-Agent": "job-agent (personal job search tool)" },
  });
  if (!res.ok) {
    console.warn(`[remoteok] ${res.status} ${res.statusText}`);
    return [];
  }
  const data = (await res.json()) as unknown[];
  const fetchedAt = new Date().toISOString();
  // First element is a metadata/legal notice object, not a job.
  return data
    .filter((entry): entry is RemoteOkJob => {
      const job = entry as RemoteOkJob;
      return Boolean(job.id && job.position && job.company);
    })
    .map((job) => ({
      id: `remoteok:${job.id}`,
      source: "remoteok" as const,
      company: job.company,
      title: job.position,
      location: job.location?.trim() ? job.location : "Remote",
      url: job.url,
      postedAt: job.date ?? null,
      fetchedAt,
    }));
}
