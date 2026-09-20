import http from "http";
import path from "path";
import { loadPersonalInfo } from "./config";
import { findSponsor } from "./sponsors";
import { upsertListings } from "./store";
import type { JobListing, JobSource } from "./types";

const PORT = Number(process.env.JOB_AGENT_PORT) || 8765;

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    // The extension's background service worker calls this with host_permissions
    // (not subject to page CORS), but this header is a harmless safety net.
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(payload);
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf-8");
  return raw ? JSON.parse(raw) : {};
}

interface SaveJobBody {
  source: JobSource;
  sourceId: string;
  company: string;
  title: string;
  location: string;
  url: string;
  postedAt?: string | null;
}

function isSaveJobBody(body: unknown): body is SaveJobBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    (b.source === "linkedin" || b.source === "indeed") &&
    typeof b.sourceId === "string" &&
    typeof b.company === "string" &&
    typeof b.title === "string" &&
    typeof b.url === "string"
  );
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/personal") {
      const info = loadPersonalInfo();
      if (!info) {
        sendJson(res, 200, { configured: false });
        return;
      }
      sendJson(res, 200, {
        configured: true,
        firstName: info.firstName,
        lastName: info.lastName,
        email: info.email,
        phone: info.phone,
        linkedinUrl: info.linkedinUrl,
        currentCompany: info.currentCompany,
        resumeFileName: info.resumePath ? path.basename(info.resumePath) : "",
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/sponsor-check") {
      const company = url.searchParams.get("company") ?? "";
      const record = company ? findSponsor(company) : undefined;
      sendJson(res, 200, record ? { matched: true, ...record } : { matched: false });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/jobs") {
      const body = await readJsonBody(req);
      if (!isSaveJobBody(body)) {
        sendJson(res, 400, { error: "Missing or invalid job fields." });
        return;
      }
      const listing: JobListing = {
        id: `${body.source}:${body.sourceId}`,
        source: body.source,
        company: body.company,
        title: body.title,
        location: body.location ?? "",
        url: body.url,
        postedAt: body.postedAt ?? null,
        fetchedAt: new Date().toISOString(),
      };
      const added = upsertListings([listing]);
      sendJson(res, 200, { added: added.length > 0, id: listing.id });
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`job-agent local server listening on http://127.0.0.1:${PORT}`);
  console.log("Keep this running while using the browser extension.");
});
