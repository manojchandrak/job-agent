import type { JobListing, SearchProfile } from "./types";

function includesAny(haystack: string, needles: string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((n) => lower.includes(n.toLowerCase()));
}

export function matchesProfile(job: JobListing, profile: SearchProfile): boolean {
  const text = `${job.title} ${job.company}`;

  if (profile.keywords.length && !includesAny(text, profile.keywords)) {
    return false;
  }
  if (profile.excludeKeywords.length && includesAny(text, profile.excludeKeywords)) {
    return false;
  }
  if (profile.locations.length && !includesAny(job.location, profile.locations)) {
    return false;
  }
  if (profile.remoteOnly && !/remote/i.test(job.location)) {
    return false;
  }
  return true;
}
