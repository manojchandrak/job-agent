import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import type { PersonalInfo, SearchProfile } from "./types";

dotenv.config();

const PROFILE_PATH = path.join(__dirname, "..", "config", "profile.json");
const PROFILE_EXAMPLE_PATH = path.join(
  __dirname,
  "..",
  "config",
  "profile.example.json",
);
const PERSONAL_PATH = path.join(__dirname, "..", "config", "personal.json");

function csv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

export function loadProfile(): SearchProfile {
  const source = fs.existsSync(PROFILE_PATH) ? PROFILE_PATH : PROFILE_EXAMPLE_PATH;
  if (!fs.existsSync(source)) {
    throw new Error(
      `No search profile found. Copy config/profile.example.json to config/profile.json and edit it.`,
    );
  }
  const raw = JSON.parse(fs.readFileSync(source, "utf-8"));
  return {
    keywords: raw.keywords ?? [],
    excludeKeywords: raw.excludeKeywords ?? [],
    locations: raw.locations ?? [],
    remoteOnly: raw.remoteOnly ?? false,
  };
}

/** Loads config/personal.json for form autofill. Returns null (autofill disabled)
 * if the file is missing or every field is still blank. */
export function loadPersonalInfo(): PersonalInfo | null {
  if (!fs.existsSync(PERSONAL_PATH)) return null;
  const raw = JSON.parse(fs.readFileSync(PERSONAL_PATH, "utf-8"));
  const info: PersonalInfo = {
    firstName: raw.firstName ?? "",
    lastName: raw.lastName ?? "",
    email: raw.email ?? "",
    phone: raw.phone ?? "",
    linkedinUrl: raw.linkedinUrl ?? "",
    currentCompany: raw.currentCompany ?? "",
    resumePath: raw.resumePath ?? "",
  };
  const hasAnyValue = Object.values(info).some((v) => v.trim() !== "");
  return hasAnyValue ? info : null;
}

export const config = {
  greenhouseBoards: csv(process.env.GREENHOUSE_BOARDS),
  leverCompanies: csv(process.env.LEVER_COMPANIES),
  includeRemoteOk: bool(process.env.INCLUDE_REMOTEOK, true),
  includeWwr: bool(process.env.INCLUDE_WWR, true),
  includeMuse: bool(process.env.INCLUDE_MUSE, true),
  adzunaAppId: process.env.ADZUNA_APP_ID,
  adzunaAppKey: process.env.ADZUNA_APP_KEY,
};
