import readlineSync from "readline-sync";
import { loadProfile, loadPersonalInfo } from "./config";
import { fetchAllListings } from "./fetchListings";
import { matchesProfile } from "./match";
import { upsertListings, setStatus, listByStatus } from "./store";
import { openForReview } from "./browser";
import { findSponsor } from "./sponsors";
import { lookupMyVisaJobs, type MyVisaJobsRecord } from "./myvisajobs";
import type { TrackedJob } from "./types";

function byPostedDateDesc(a: TrackedJob, b: TrackedJob): number {
  const aTime = a.postedAt ? new Date(a.postedAt).getTime() : 0;
  const bTime = b.postedAt ? new Date(b.postedAt).getTime() : 0;
  return bTime - aTime;
}

// Requested priority: senior first, then lead, then principal, everything else last.
const SENIORITY_TIERS: [string, RegExp][] = [
  ["senior", /\b(senior|sr\.?)\b/i],
  ["lead", /\blead\b/i],
  ["principal", /\bprincipal\b/i],
];

function seniorityRank(title: string): number {
  const index = SENIORITY_TIERS.findIndex(([, pattern]) => pattern.test(title));
  return index === -1 ? SENIORITY_TIERS.length : index;
}

function bySeniorityThenDate(a: TrackedJob, b: TrackedJob): number {
  const rankDiff = seniorityRank(a.title) - seniorityRank(b.title);
  return rankDiff !== 0 ? rankDiff : byPostedDateDesc(a, b);
}

function formatDate(iso: string | null): string {
  if (!iso) return "unknown date";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "unknown date" : date.toISOString().slice(0, 10);
}

async function search(): Promise<void> {
  const profile = loadProfile();
  console.log("Fetching listings...");
  const listings = await fetchAllListings();
  console.log(`Fetched ${listings.length} listings, filtering against your profile...`);

  const matches = listings.filter((job) => matchesProfile(job, profile));
  const added = upsertListings(matches);

  console.log(`${matches.length} matched your profile, ${added.length} are new.`);
  if (added.length > 0) {
    await review(added);
  }
}

async function review(jobs: TrackedJob[]): Promise<void> {
  const personalInfo = loadPersonalInfo();
  for (const job of jobs) {
    console.log(`\n${job.company} — ${job.title}`);
    console.log(`  posted ${formatDate(job.postedAt)} | ${job.location} | ${job.source} | ${job.url}`);
    const answer = readlineSync
      .question("  [o]pen / [s]ave / [x]skip / [q]uit review: ")
      .trim()
      .toLowerCase();

    if (answer === "q") break;
    if (answer === "o") {
      setStatus(job.id, "interested");
      await openForReview(job.url, personalInfo);
      setStatus(job.id, "applied");
    } else if (answer === "s") {
      setStatus(job.id, "interested");
    } else {
      setStatus(job.id, "skipped");
    }
  }
}

async function reviewNew(): Promise<void> {
  const jobs = listByStatus("new").sort(bySeniorityThenDate);
  if (jobs.length === 0) {
    console.log("No new jobs to review. Run `npm run search` first.");
    return;
  }
  console.log(`${jobs.length} new job(s) to review: senior first, then lead, then principal, then newest-first within each.`);
  await review(jobs);
}

function status(): void {
  const jobs = listByStatus();
  const byStatus = new Map<string, TrackedJob[]>();
  for (const job of jobs) {
    const list = byStatus.get(job.status) ?? [];
    list.push(job);
    byStatus.set(job.status, list);
  }
  for (const [statusName, list] of byStatus) {
    console.log(`\n${statusName.toUpperCase()} (${list.length})`);
    for (const job of list.sort(bySeniorityThenDate)) {
      console.log(`  [${formatDate(job.postedAt)}] ${job.company} — ${job.title} (${job.url})`);
    }
  }
  if (jobs.length === 0) console.log("No tracked jobs yet. Run `npm run search` first.");
}

function sponsors(): void {
  const jobs = listByStatus().sort(byPostedDateDesc);
  if (jobs.length === 0) {
    console.log("No tracked jobs yet. Run `npm run search` first.");
    return;
  }

  const matches: { job: TrackedJob; years: number[]; approvals: number }[] = [];
  for (const job of jobs) {
    const record = findSponsor(job.company);
    if (record) matches.push({ job, years: record.years.sort(), approvals: record.approvals });
  }

  console.log(
    `${matches.length} of ${jobs.length} tracked job(s) are at companies with H-1B petition history:\n`,
  );
  for (const { job, years, approvals } of matches) {
    console.log(
      `  [${formatDate(job.postedAt)}] ${job.company} — ${job.title} (sponsored FY ${years.join(", ")}, ${approvals} approvals)`,
    );
    console.log(`    ${job.url}`);
  }
  console.log(
    "\nNote: matching is by company name against USCIS H-1B Employer Data Hub (FY2019-2023) " +
      "and may include false positives/negatives — recruiter/staffing agency names, name variants, " +
      "or newer sponsorship not yet in the dataset. Verify before relying on this.",
  );
}

async function sponsorsLive(): Promise<void> {
  const jobs = listByStatus().sort(byPostedDateDesc);
  if (jobs.length === 0) {
    console.log("No tracked jobs yet. Run `npm run search` first.");
    return;
  }

  const uniqueCompanies = [...new Set(jobs.map((j) => j.company))];
  console.log(
    `Checking ${uniqueCompanies.length} unique companies against myvisajobs.com (cached results reused)...`,
  );

  const results = new Map<string, MyVisaJobsRecord | null>();
  for (const company of uniqueCompanies) {
    results.set(company, await lookupMyVisaJobs(company));
  }

  const matches: { job: TrackedJob; record: MyVisaJobsRecord }[] = [];
  for (const job of jobs) {
    const record = results.get(job.company);
    // A record can exist with a matched employer name but zero filings (h1bTotal
    // and gcTotal both null) — that's not sponsorship history, just a name hit.
    if (record && (record.h1bTotal !== null || record.gcTotal !== null)) {
      matches.push({ job, record });
    }
  }

  console.log(
    `\n${matches.length} of ${jobs.length} tracked job(s) are at companies myvisajobs.com shows LCA/green-card filings for (last 3 fiscal years):\n`,
  );
  for (const { job, record } of matches) {
    const h1b = record.h1bTotal !== null ? `${record.h1bDeniedOrWithdrawn}/${record.h1bTotal} denied/withdrawn` : "no H-1B data";
    const gc = record.gcTotal !== null ? `${record.gcDeniedOrWithdrawn}/${record.gcTotal} denied/withdrawn` : "no green card data";
    console.log(
      `  [${formatDate(job.postedAt)}] ${job.company} — ${job.title} (matched: ${record.matchedName}, H-1B LCA ${h1b}, Green Card LC ${gc})`,
    );
    console.log(`    ${job.url}`);
  }
  console.log(
    "\nNote: matching is by company name against myvisajobs.com's public employer search " +
      "(last 3 fiscal years) and may include false positives/negatives — recruiter/staffing agency " +
      "names, name variants, or unlisted employers. Verify before relying on this.",
  );
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "search";
  if (command === "search") {
    await search();
  } else if (command === "status") {
    status();
  } else if (command === "review") {
    await reviewNew();
  } else if (command === "sponsors") {
    sponsors();
  } else if (command === "sponsors-live") {
    await sponsorsLive();
  } else {
    console.log(
      "Usage: npm run search | npm run status | npm run review | npm run sponsors | npm run sponsors:live",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
