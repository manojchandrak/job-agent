import { config, loadProfile } from "./config";
import { fetchGreenhouse } from "./sources/greenhouse";
import { fetchLever } from "./sources/lever";
import { fetchRemoteOk } from "./sources/remoteok";
import { fetchWwr } from "./sources/wwr";
import { fetchMuse } from "./sources/muse";
import { fetchAdzuna } from "./sources/adzuna";
import type { JobListing } from "./types";

export async function fetchAllListings(): Promise<JobListing[]> {
  const tasks: Promise<JobListing[]>[] = [];

  for (const board of config.greenhouseBoards) tasks.push(fetchGreenhouse(board));
  for (const company of config.leverCompanies) tasks.push(fetchLever(company));
  if (config.includeRemoteOk) tasks.push(fetchRemoteOk());
  if (config.includeWwr) tasks.push(fetchWwr());
  if (config.includeMuse) tasks.push(fetchMuse());
  if (config.adzunaAppId && config.adzunaAppKey) {
    const profile = loadProfile();
    tasks.push(fetchAdzuna(config.adzunaAppId, config.adzunaAppKey, profile.keywords));
  } else {
    console.warn(
      "[adzuna] skipped — set ADZUNA_APP_ID / ADZUNA_APP_KEY in .env for broader US " +
        "coverage (free key at https://developer.adzuna.com).",
    );
  }

  if (tasks.length === 0) {
    console.warn(
      "No sources configured. Set GREENHOUSE_BOARDS / LEVER_COMPANIES in .env, " +
        "or leave INCLUDE_REMOTEOK / INCLUDE_WWR / INCLUDE_MUSE at their defaults.",
    );
  }

  const results = await Promise.all(tasks);
  return results.flat();
}
