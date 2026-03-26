import { NotificationManager } from "../notification/manager";
import { fetchToyokoInnAvailabilityFromApi } from "../hotel/toyoko-inn-plugin";
import { createAdminClient } from "@/src/utils/supabase/admin";

/**
 * 进程内状态记忆：
 * 仅用于判定“无房 -> 有房”的通知触发条件，避免每轮都重复发送。
 * 注意：若服务重启/冷启动，该内存会丢失。
 */
const lastStatusByHotelId = new Map<string, ToyokoHotelStatus>();
const TOYOKO_STATUS_TABLE = "toyoko_monitor_state";

export type ToyokoHotelStatus = "有房" | "无房" | "未知";

export type ToyokoHotelRow = {
  id: string;
  label: string;
  status: ToyokoHotelStatus;
  url?: string;
  date_range?: string;
};

export type ToyokoInnSeoulScanResult = {
  start: string;
  end: string;
  hotelIds: string[];
  hotels: ToyokoHotelRow[];
  checked: number;
  hasVacantHotels: string[];
  blockedHotels: string[];
  errorHotels: Array<{ hotel: string; error: string }>;
};

async function loadPreviousStatuses(
  hotelIds: string[]
): Promise<Map<string, ToyokoHotelStatus>> {
  const fallback = new Map(lastStatusByHotelId);
  if (!hotelIds.length) return fallback;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(TOYOKO_STATUS_TABLE)
      .select("hotel_id,last_status")
      .in("hotel_id", hotelIds);

    if (error) {
      console.warn(
        `[ToyokoInn] 读取 ${TOYOKO_STATUS_TABLE} 失败，回退内存状态:`,
        error.message
      );
      return fallback;
    }

    const result = new Map<string, ToyokoHotelStatus>();
    for (const row of (data ?? []) as Array<{
      hotel_id?: string;
      last_status?: string;
    }>) {
      const id = row.hotel_id ?? "";
      const status = row.last_status;
      if (!id) continue;
      if (status === "有房" || status === "无房" || status === "未知") {
        result.set(id, status);
      }
    }

    // 数据库无数据时，保留内存里的旧值做兜底（例如本地开发刚切换版本）
    if (!result.size && fallback.size) return fallback;
    return result;
  } catch (err) {
    console.warn("[ToyokoInn] 读取数据库状态异常，回退内存状态:", err);
    return fallback;
  }
}

async function persistStatuses(statusMap: Map<string, ToyokoHotelStatus>) {
  if (!statusMap.size) return;
  const nowIso = new Date().toISOString();
  const rows = Array.from(statusMap.entries()).map(([hotel_id, last_status]) => ({
    hotel_id,
    last_status,
    updated_at: nowIso,
  }));

  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from(TOYOKO_STATUS_TABLE)
      .upsert(rows, { onConflict: "hotel_id" });
    if (error) {
      console.warn(
        `[ToyokoInn] 写入 ${TOYOKO_STATUS_TABLE} 失败，仍保留内存状态:`,
        error.message
      );
    }
  } catch (err) {
    console.warn("[ToyokoInn] 写入数据库状态异常，仍保留内存状态:", err);
  }

  // 无论数据库是否可用，内存也同步一份兜底
  for (const [k, v] of statusMap.entries()) {
    lastStatusByHotelId.set(k, v);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCsvList(input: string | undefined): string[] {
  if (!input) return [];
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** JSON: {"00311":"首尔永登浦",...} 可选，用于列表展示店名 */
function parseHotelLabelsFromEnv(): Record<string, string> {
  const raw = process.env.TOYOKO_HOTEL_LABELS;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    // ignore
  }
  return {};
}

function labelForHotelId(
  id: string,
  labels: Record<string, string>
): string {
  const fromEnv = labels[id];
  if (fromEnv) return fromEnv;
  return `店 ${id}`;
}

function dateRangeFromUrl(sourceUrl: string): string | null {
  try {
    const u = new URL(sourceUrl);
    const start = u.searchParams.get("start") ?? "";
    const end = u.searchParams.get("end") ?? "";
    if (!start || !end) return null;
    return `${start} ~ ${end}`;
  } catch {
    return null;
  }
}

function stripHtmlTags(input: string): string {
  return input.replace(/<[^>]+>/g, " ");
}

function decodeHtmlEntities(input: string): string {
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

function extractToyokoInnLocationFromHtml(html: string): string | null {
  const h1Matches = html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi);
  for (const m of h1Matches) {
    const raw = m?.[1] ?? "";
    if (!raw) continue;
    const title = decodeHtmlEntities(stripHtmlTags(raw))
      .replace(/\s+/g, " ")
      .trim();
    if (!title) continue;

    const cnOrJp = title.match(/([东東]横INN)\s*(.*)$/i);
    if (cnOrJp?.[2]) {
      const location = cnOrJp[2].trim();
      if (location) return location;
    }

    const en = title.match(/(Toyoko\s*Inn)\s*(.*)$/i);
    if (en?.[2]) {
      const location = en[2].trim();
      if (location) return location;
    }
  }
  return null;
}

function parseToyokoStatusFromHtml(html: string): "有房" | "无房" | null {
  // 用户指定规则：
  // 看到“未找到符合条件的结果。请更改搜寻条件重试。” => 无房；否则 => 有房。
  // 这里做空白归一化，兼容页面中换行/多空格导致的匹配失败。
  const normalized = html.replace(/\s+/g, "");
  if (
    normalized.includes("未找到符合条件的结果。请更改搜寻条件重试。") ||
    normalized.includes("未找到符合条件的结果。请更改搜寻条件重试")
  ) {
    return "无房";
  }
  return "有房";
}

async function fetchToyokoPageMeta(sourceUrl: string): Promise<{
  location: string | null;
  status: "有房" | "无房" | null;
}> {
  const timeoutMs = Number(process.env.HOTEL_FETCH_TIMEOUT_MS ?? "8000");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const userAgent =
      process.env.HOTEL_SCRAPE_USER_AGENT ??
      "Mozilla/5.0 (compatible; NotificationBot/1.0)";
    const resp = await fetch(sourceUrl, {
      method: "GET",
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    }).catch(() => null);
    if (!resp?.ok) return { location: null, status: null };
    const html = await resp.text().catch(() => "");
    if (!html) return { location: null, status: null };
    return {
      location: extractToyokoInnLocationFromHtml(html),
      status: parseToyokoStatusFromHtml(html),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function scanToyokoInnSeoul(options?: {
  sendNotifications?: boolean;
}): Promise<ToyokoInnSeoulScanResult> {
  const start = process.env.TOYOKO_START_YMD ?? "2026-05-01";
  const end = process.env.TOYOKO_END_YMD ?? "2026-05-03";

  // 逗号分隔：例如 "00208,00251,00291,00311"
  const parsedIds = parseCsvList(process.env.TOYOKO_SEOUL_HOTELS);
  const hotelIds =
    parsedIds.length > 0
      ? parsedIds
      : ["00208", "00282", "00291", "00311"];

  const room = Number(process.env.TOYOKO_ROOM ?? "1");
  const people = Number(process.env.TOYOKO_PEOPLE ?? "2");
  const smoking = process.env.TOYOKO_SMOKING ?? "noSmoking";

  const sleepMs = Number(process.env.TOYOKO_SLEEP_MS ?? "2000");
  const jitterMs = Number(process.env.TOYOKO_SLEEP_JITTER_MS ?? "500");

  const sendNotifications =
    options?.sendNotifications ?? process.env.TOYOKO_SEND_NOTIFICATIONS !== "0";

  const notifier = new NotificationManager();

  const hotelLabels = parseHotelLabelsFromEnv();
  const hotels: ToyokoHotelRow[] = [];
  const hasVacantHotels: string[] = [];
  const transitionedToVacantHotels: string[] = [];
  const blockedHotels: string[] = [];
  const errorHotels: Array<{ hotel: string; error: string }> = [];

  const extraSourceUrls = [
    "https://www.toyoko-inn.com/search/result/room_plan/?hotel=00256&start=2026-08-19&end=2026-08-22&room=1&people=2&smoking=noSmoking&tab=roomType&sort=recommend&r_avail_only=true",
  ];

  type ScanTarget = { id: string; sourceUrl: string };
  const targets: ScanTarget[] = [];

  // 该扫描逻辑依赖 Toyoko 的内部接口；反爬时需要 Cookie/IP。
  for (const hotel of hotelIds) {
    // 为了复用你已经写好的 Toyoko plugin（它从 source_url 中解析参数）
    const fakeSourceUrl = `https://www.toyoko-inn.com/search/result/room_plan/?hotel=${encodeURIComponent(
      hotel
    )}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(
      end
    )}&room=${encodeURIComponent(String(room))}&people=${encodeURIComponent(
      String(people)
    )}&smoking=${encodeURIComponent(
      smoking
    )}&tab=roomType&sort=recommend&r_avail_only=true`;

    targets.push({ id: hotel, sourceUrl: fakeSourceUrl });
  }

  for (const extraUrl of extraSourceUrls) {
    try {
      const u = new URL(extraUrl);
      const hotel = u.searchParams.get("hotel");
      if (!hotel) continue;
      targets.push({ id: hotel, sourceUrl: extraUrl });
    } catch {
      // ignore invalid url
    }
  }

  const previousStatuses = await loadPreviousStatuses(
    targets.map((t) => t.id)
  );
  const currentStatuses = new Map<string, ToyokoHotelStatus>();

  for (const target of targets) {
    const hotel = target.id;
    const fakeSourceUrl = target.sourceUrl;
    const dateRange = dateRangeFromUrl(fakeSourceUrl) ?? `${start} ~ ${end}`;
    try {
      const pageMeta = await fetchToyokoPageMeta(fakeSourceUrl);
      const apiResult = await fetchToyokoInnAvailabilityFromApi({
        hotel_name: "",
        location: "",
        monitor_date: start,
        status: "无房",
        source_url: fakeSourceUrl,
      });

      const label = pageMeta.location || labelForHotelId(hotel, hotelLabels);
      const resolvedStatus = pageMeta.status ?? apiResult?.status ?? "未知";

      if (resolvedStatus === "未知") {
        blockedHotels.push(hotel);
        hotels.push({
          id: hotel,
          label,
          status: resolvedStatus,
          url: fakeSourceUrl,
          date_range: dateRange,
        });
      } else if (resolvedStatus === "有房") {
        hasVacantHotels.push(hotel);
        const prev = previousStatuses.get(hotel);
        if (prev === "无房") {
          transitionedToVacantHotels.push(hotel);
        }
        hotels.push({
          id: hotel,
          label,
          status: resolvedStatus,
          url: fakeSourceUrl,
          date_range: dateRange,
        });
      } else {
        hotels.push({
          id: hotel,
          label,
          status: resolvedStatus,
          url: fakeSourceUrl,
          date_range: dateRange,
        });
      }
      currentStatuses.set(hotel, resolvedStatus);
    } catch (err) {
      errorHotels.push({
        hotel,
        error: err instanceof Error ? err.message : "unknown error",
      });
      hotels.push({
        id: hotel,
        label: labelForHotelId(hotel, hotelLabels),
        status: "未知",
        url: fakeSourceUrl,
        date_range: dateRange,
      });
      currentStatuses.set(hotel, "未知");
    }

    // 防止被封：每家店请求后 sleep
    await sleep(sleepMs + Math.floor(Math.random() * jitterMs));
  }

  await persistStatuses(currentStatuses);

  if (sendNotifications && transitionedToVacantHotels.length > 0) {
    const content = `Toyoko Inn 首尔：以下店铺状态由无房变为有房：${transitionedToVacantHotels.join("、")}（${start} -> ${end}）`;
    await notifier.quickNotify(content);
  }

  return {
    start,
    end,
    hotelIds,
    hotels,
    checked: hotelIds.length,
    hasVacantHotels,
    blockedHotels,
    errorHotels,
  };
}

