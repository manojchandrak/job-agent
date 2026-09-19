import type { JobListing } from "../types";

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location: { name: string };
  updated_at: string;
}

export async function fetchGreenhouse(boardToken: string): Promise<JobListing[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[greenhouse] ${boardToken}: ${res.status} ${res.statusText}`);
    return [];
  }
  const data = (await res.json()) as { jobs: GreenhouseJob[] };
  const fetchedAt = new Date().toISOString();
  return data.jobs.map((job) => ({
    id: `greenhouse:${boardToken}:${job.id}`,
    source: "greenhouse" as const,
    company: boardToken,
    title: job.title,
    location: job.location?.name ?? "Unknown",
    url: job.absolute_url,
    postedAt: job.updated_at ?? null,
    fetchedAt,
  }));
}
