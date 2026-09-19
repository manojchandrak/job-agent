import type { JobListing } from "../types";

interface LeverJob {
  id: string;
  text: string;
  hostedUrl: string;
  categories?: { location?: string };
  createdAt: number;
}

export async function fetchLever(company: string): Promise<JobListing[]> {
  const url = `https://api.lever.co/v0/postings/${company}?mode=json`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[lever] ${company}: ${res.status} ${res.statusText}`);
    return [];
  }
  const jobs = (await res.json()) as LeverJob[];
  const fetchedAt = new Date().toISOString();
  return jobs.map((job) => ({
    id: `lever:${company}:${job.id}`,
    source: "lever" as const,
    company,
    title: job.text,
    location: job.categories?.location ?? "Unknown",
    url: job.hostedUrl,
    postedAt: job.createdAt ? new Date(job.createdAt).toISOString() : null,
    fetchedAt,
  }));
}
