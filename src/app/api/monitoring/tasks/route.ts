import { createClient } from "@/src/utils/supabase/server";
import { createAdminClient } from "@/src/utils/supabase/admin";
import { UniversalMonitor } from "@/src/lib/hotel/universal-monitor";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

type CreateMonitoringTaskBody = {
  source_url: string;
};

function isISODate(input: string): boolean {
  // 简单校验：YYYY-MM-DD
  return /^\d{4}-\d{2}-\d{2}$/.test(input);
}

function parseYMDFromUrl(input: string): string | null {
  try {
    const u = new URL(input);

    // 优先从 query 参数里找 YYYY-MM-DD
    const candidateValues = [
      ...u.searchParams.values(),
    ];
    for (const v of candidateValues) {
      const match = v?.match(/\d{4}-\d{2}-\d{2}/);
      if (match && isISODate(match[0])) return match[0];
    }

    // 再兜底：从整个 URL 字符串匹配（可能包含入住/退房）
    const match = u.toString().match(/\d{4}-\d{2}-\d{2}/);
    if (match && isISODate(match[0])) return match[0];

    return null;
  } catch {
    return null;
  }
}

function parseHotelNameFromUrl(input: string): string {
  try {
    const u = new URL(input);
    const host = u.hostname.replace(/^www\./, "");
    const parts = host.split(".");
    const secondLevel = parts.length >= 2 ? parts[parts.length - 2] : host;
    const cleaned = decodeURIComponent(secondLevel)
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) return "未知酒店";

    // 简单美化：把每个词首字母大写（不强行做行业翻译）
    return cleaned
      .split(" ")
      .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1))
      .join(" ");
  } catch {
    return "未知酒店";
  }
}

function parseLocationFromUrl(input: string): string {
  try {
    const u = new URL(input);
    const segments = u.pathname.split("/").filter(Boolean);

    // Toyoko：URL 路径里的第一段（如 china_cn）/search 不是实际分店名；
    // 为了避免写入错误地点，先保持未知，后续扫描阶段会用页面 h1 修正。
    if (u.hostname.includes("toyoko-inn.com")) {
      return "未知地点";
    }

    // 对这类：/china_cn/search/result/... 这种结构，优先把第一段当地区/地点
    const first = segments[0];
    if (first && first.length <= 60) {
      const cleaned = decodeURIComponent(first)
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (cleaned) return cleaned;
    }

    const keys = ["destination", "city", "location", "region", "place"];
    for (const k of keys) {
      const v = u.searchParams.get(k);
      if (v) {
        const cleaned = decodeURIComponent(v).replace(/\s+/g, " ").trim();
        if (cleaned) return cleaned.slice(0, 40);
      }
    }

    const host = u.hostname.replace(/^www\./, "");
    return host || "未知地点";
  } catch {
    return "未知地点";
  }
}

function todayYMD(): string {
  return new Date().toISOString().slice(0, 10);
}

function stripHtmlTags(input: string): string {
  return input.replace(/<[^>]+>/g, " ");
}

function decodeHtmlEntities(input: string): string {
  // 只实现本项目需要的少量实体，避免引入额外依赖。
  return input
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_m, n) => {
      const code = Number(n);
      if (Number.isNaN(code)) return "";
      try {
        return String.fromCharCode(code);
      } catch {
        return "";
      }
    });
}

async function fetchTextWithTimeout(url: string, ms: number): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          process.env.HOTEL_SCRAPE_USER_AGENT ??
          "Mozilla/5.0 (compatible; NotificationBot/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });
    if (!resp.ok) return "";
    return await resp.text().catch(() => "");
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseToyokoFromH1(h1Text: string): {
  hotel_name: string;
  location: string;
} | null {
  const cleaned = decodeHtmlEntities(stripHtmlTags(h1Text))
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;

  // 适配：
  // - 東横INN xxx
  // - 东横INN xxx
  // - Toyoko Inn xxx
  const brandCnMatch = cleaned.match(/([东東]横INN)/i);
  const brandEnMatch = cleaned.match(/(Toyoko\s*Inn)/i);

  if (brandCnMatch) {
    const brand = "东横INN";
    const location = cleaned.replace(brandCnMatch[1], "").trim().replace(/^[-|·]+/, "").trim();
    if (!location) return null;
    return { hotel_name: brand, location };
  }

  if (brandEnMatch) {
    const brand = "Toyoko Inn";
    const location = cleaned
      .replace(brandEnMatch[1], "")
      .trim()
      .replace(/^[-|·]+/, "")
      .trim();
    if (!location) return null;
    return { hotel_name: brand, location };
  }

  // 不符合 Toyoko 分支标题时不覆盖（避免误判）
  return null;
}

function extractFirstToyokoH1(html: string): string | null {
  // 优先挑选包含 INN/东横字样的 h1
  const matches = html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi);
  for (const m of matches) {
    const raw = m?.[1] ?? "";
    if (raw.includes("INN") || raw.includes("INN") || raw.includes("横") || raw.includes("東")) {
      return raw;
    }
  }
  return null;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 使用 admin client 读取，避免未配置 RLS 时导致列表为空。
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("monitoring_tasks")
    .select(
      "id, hotel_name, location, monitor_date, status, is_active, last_check, source_url"
    )
    .order("monitor_date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tasks: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 写入使用 admin client，避免未配置 RLS/policy 时无法创建任务。
  const admin = createAdminClient();

  const body: unknown = await req.json().catch(() => null);
  const b = body as Partial<CreateMonitoringTaskBody> | null;
  const sourceUrl =
    typeof b?.source_url === "string" ? b.source_url.trim() : "";

  if (!sourceUrl) {
    return NextResponse.json({ error: "Invalid payload: source_url required." }, { status: 400 });
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    return NextResponse.json({ error: "Invalid source_url: not a valid URL." }, { status: 400 });
  }
  if (!(parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:")) {
    return NextResponse.json({ error: "Invalid source_url: only http/https allowed." }, { status: 400 });
  }

  const monitorDate = parseYMDFromUrl(sourceUrl) ?? todayYMD();
  if (!isISODate(monitorDate)) {
    return NextResponse.json({ error: "Could not parse monitor_date from URL." }, { status: 400 });
  }

  let hotelName = parseHotelNameFromUrl(sourceUrl);
  let location = parseLocationFromUrl(sourceUrl);

  // 尽量根据 URL 直接抓取页面，提取更“真实”的酒店名/地点。
  // 以 Toyoko Inn 的页面结构为例：h1 通常形如 “東横INN xxx”。
  try {
    const timeoutMs = Number(process.env.HOTEL_FETCH_TIMEOUT_MS ?? 8000);
    const host = parsedUrl.hostname;
    if (host.includes("toyoko-inn.com")) {
      const html = await fetchTextWithTimeout(sourceUrl, timeoutMs);
      if (html) {
        const h1 = extractFirstToyokoH1(html);
        if (h1) {
          const parsed = parseToyokoFromH1(h1);
          if (parsed) {
            hotelName = parsed.hotel_name;
            location = parsed.location;
          }
        }
      }
    }
  } catch {
    // 抓取失败则保持 URL 解析出来的基础信息，不阻断新增任务。
  }

  const { data, error } = await admin
    .from("monitoring_tasks")
    .insert({
      // 避免依赖数据库默认的 `gen_random_uuid()`（需要 pgcrypto）。
      // 使用服务端生成 UUID，确保表即使没启用 pgcrypto 也能插入。
      id: randomUUID(),
      hotel_name: hotelName,
      location,
      monitor_date: monitorDate,
      // 新增监控表单不让用户选择：默认无房，并默认激活。
      status: "无房",
      is_active: true,
      source_url: sourceUrl,
    })
    .select(
      "id, hotel_name, location, monitor_date, status, is_active, last_check, source_url"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 新增后立即跑一次扫描（仅扫描刚新增的任务），让 last_check/status 立刻刷新，
  // 否则用户会看到默认插入的 "无房" 且 last_check 仍是空。
  const monitor = new UniversalMonitor();
  await monitor.startScan({ taskIds: [data.id] });

  const { data: refreshed, error: refreshError } = await admin
    .from("monitoring_tasks")
    .select(
      "id, hotel_name, location, monitor_date, status, is_active, last_check, source_url"
    )
    .eq("id", data.id)
    .single();

  if (refreshError) {
    // 刷新失败也不影响返回创建成功
    return NextResponse.json({ task: data });
  }

  return NextResponse.json({ task: refreshed });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const body: unknown = await req.json().catch(() => null);
  const b = body as { id?: unknown } | null;
  const id = typeof b?.id === "string" ? b.id : "";

  if (!id) {
    return NextResponse.json({ error: "Invalid payload: id required." }, { status: 400 });
  }

  const { error } = await admin
    .from("monitoring_tasks")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

