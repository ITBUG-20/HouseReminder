import { NextResponse } from "next/server";
import { scanToyokoInnSeoul } from "@/src/lib/toyoko/scan-toyoko-inn-seoul";

export const runtime = "nodejs";

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // 未配置时本地/联调允许
  const header = req.headers.get("x-cron-secret");
  return header === secret;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await scanToyokoInnSeoul({ sendNotifications: true });
  return NextResponse.json({ ok: true, result });
}

export async function GET(req: Request) {
  return POST(req);
}

