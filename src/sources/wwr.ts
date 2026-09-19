import { XMLParser } from "fast-xml-parser";
import type { JobListing } from "../types";

interface WwrItem {
  title: string;
  link: string;
  guid: string | { "#text": string };
  pubDate: string;
  region?: string;
}

function guidText(guid: WwrItem["guid"]): string {
  return typeof guid === "string" ? guid : guid["#text"];
}

export async function fetchWwr(): Promise<JobListing[]> {
  const res = await fetch("https://weworkremotely.com/remote-jobs.rss");
  if (!res.ok) {
    console.warn(`[wwr] ${res.status} ${res.statusText}`);
    return [];
  }
  const xml = await res.text();
  const parser = new XMLParser();
  const parsed = parser.parse(xml);
  const items: WwrItem[] = parsed?.rss?.channel?.item ?? [];
  const fetchedAt = new Date().toISOString();
  return items.map((item) => {
    // WWR titles are formatted "Company: Job Title"
    const [company, ...rest] = item.title.split(":");
    return {
      id: `wwr:${guidText(item.guid)}`,
      source: "wwr" as const,
      company: (company ?? "Unknown").trim(),
      title: (rest.join(":") || item.title).trim(),
      location: item.region ?? "Remote",
      url: item.link,
      postedAt: item.pubDate ?? null,
      fetchedAt,
    };
  });
}
