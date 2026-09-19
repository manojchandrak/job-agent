import fs from "fs";
import path from "path";
import type { JobListing, JobStatus, TrackedJob } from "./types";

const DATA_PATH = path.join(__dirname, "..", "data", "jobs.json");

function readAll(): Record<string, TrackedJob> {
  if (!fs.existsSync(DATA_PATH)) return {};
  return JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
}

function writeAll(jobs: Record<string, TrackedJob>): void {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(jobs, null, 2));
}

export function upsertListings(listings: JobListing[]): TrackedJob[] {
  const jobs = readAll();
  const newlyAdded: TrackedJob[] = [];
  for (const listing of listings) {
    if (jobs[listing.id]) continue;
    const tracked: TrackedJob = {
      ...listing,
      status: "new",
      notes: "",
      updatedAt: new Date().toISOString(),
    };
    jobs[listing.id] = tracked;
    newlyAdded.push(tracked);
  }
  writeAll(jobs);
  return newlyAdded;
}

export function setStatus(id: string, status: JobStatus, notes?: string): void {
  const jobs = readAll();
  const job = jobs[id];
  if (!job) throw new Error(`Unknown job id: ${id}`);
  job.status = status;
  if (notes !== undefined) job.notes = notes;
  job.updatedAt = new Date().toISOString();
  writeAll(jobs);
}

export function listByStatus(status?: JobStatus): TrackedJob[] {
  const jobs = Object.values(readAll());
  return status ? jobs.filter((j) => j.status === status) : jobs;
}

export function getJob(id: string): TrackedJob | undefined {
  return readAll()[id];
}
