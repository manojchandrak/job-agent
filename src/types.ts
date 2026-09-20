export type JobSource =
  | "greenhouse"
  | "lever"
  | "remoteok"
  | "wwr"
  | "muse"
  | "adzuna"
  | "linkedin"
  | "indeed";

export interface JobListing {
  id: string; // stable id: `${source}:${sourceJobId}`
  source: JobSource;
  company: string;
  title: string;
  location: string;
  url: string;
  postedAt: string | null; // ISO date, when the source provides one
  fetchedAt: string; // ISO date
}

export type JobStatus =
  | "new"
  | "interested"
  | "skipped"
  | "applied"
  | "interview"
  | "rejected"
  | "offer";

export interface TrackedJob extends JobListing {
  status: JobStatus;
  notes: string;
  updatedAt: string; // ISO date
}

export interface SearchProfile {
  keywords: string[];
  excludeKeywords: string[];
  locations: string[]; // substrings to match against listing.location; empty = any
  remoteOnly: boolean;
}

export interface PersonalInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  currentCompany: string;
  resumePath: string; // absolute or repo-relative path to a resume file
}
