import fs from "fs";
import path from "path";

const H1B_DIR = path.join(__dirname, "..", "data", "h1b");

export interface SponsorRecord {
  years: number[];
  approvals: number;
}

const SUFFIX_WORDS = new Set([
  "inc", "incorporated", "llc", "llp", "lp", "ltd", "limited", "corp",
  "corporation", "co", "company", "plc", "pc", "pllc", "group", "holdings",
  "technologies", "technology", "solutions", "systems", "services", "usa",
  "us", "na", "international",
]);

/** Normalizes a company name for fuzzy matching: uppercase, strip punctuation,
 * drop a trailing "DBA ..." alias, and drop generic corporate suffix words. */
export function normalizeCompanyName(name: string): string {
  const withoutDba = name.split(/\bDBA\b/i)[0];
  const cleaned = withoutDba
    .toUpperCase()
    .replace(/[.,'"()]/g, "")
    .replace(/[^A-Z0-9\s&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ").filter((w) => !SUFFIX_WORDS.has(w.toLowerCase()));
  return (words.length > 0 ? words.join(" ") : cleaned).trim();
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

let sponsorIndex: Map<string, SponsorRecord> | null = null;

/** Loads and caches the H-1B employer sponsor index from data/h1b/*.csv
 * (USCIS H-1B Employer Data Hub exports: https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub). */
export function loadSponsorIndex(): Map<string, SponsorRecord> {
  if (sponsorIndex) return sponsorIndex;
  const index = new Map<string, SponsorRecord>();
  if (!fs.existsSync(H1B_DIR)) {
    sponsorIndex = index;
    return index;
  }

  const files = fs.readdirSync(H1B_DIR).filter((f) => f.endsWith(".csv"));
  for (const file of files) {
    const lines = fs.readFileSync(path.join(H1B_DIR, file), "utf-8").split("\n");
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const [fyRaw, employerRaw, initApproval, , contApproval] = parseCsvLine(line);
      if (!employerRaw) continue;
      const key = normalizeCompanyName(employerRaw);
      if (!key) continue;
      const fy = Number(fyRaw);
      const approvals = (Number(initApproval) || 0) + (Number(contApproval) || 0);

      const existing = index.get(key) ?? { years: [], approvals: 0 };
      if (!existing.years.includes(fy)) existing.years.push(fy);
      existing.approvals += approvals;
      index.set(key, existing);
    }
  }

  sponsorIndex = index;
  return index;
}

/** Looks up whether a company name matches a known H-1B sponsor. Falls back to a
 * whole-word subset match (e.g. "Acme Consulting" ~ "ACME CONSULTING GROUP") rather
 * than raw substring containment, which would wrongly match "Develop" inside
 * "Development Dimensions International". */
export function findSponsor(companyName: string): SponsorRecord | undefined {
  const index = loadSponsorIndex();
  const key = normalizeCompanyName(companyName);
  const direct = index.get(key);
  if (direct) return direct;

  const keyWords = key.split(" ").filter((w) => w.length >= 3);
  if (keyWords.length === 0) return undefined;
  const keyWordSet = new Set(keyWords);

  for (const [sponsorKey, record] of index) {
    const sponsorWords = sponsorKey.split(" ").filter((w) => w.length >= 3);
    if (sponsorWords.length === 0) continue;
    const sponsorWordSet = new Set(sponsorWords);
    const [smaller, larger] =
      keyWordSet.size <= sponsorWordSet.size ? [keyWordSet, sponsorWordSet] : [sponsorWordSet, keyWordSet];
    let allMatch = true;
    for (const w of smaller) {
      if (!larger.has(w)) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return record;
  }
  return undefined;
}
