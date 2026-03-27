import { NotificationManager } from "../notification/manager";
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

type AiStatusResult = {
  status: "有房" | "无房" | "未知";
  reason?: string;
  evidence?: string[];
  debug?: {
    error_type?:
      | "http_non_200"
      | "timeout_or_abort"
      | "empty_text"
      | "json_parse_fail"
      | "unknown";
    http_status?: number;
    raw_preview?: string;
  };
};

function extractAiEvidenceText(html: string): string {
  // 给常见块级标签打断行，尽量保留“片段边界”。
  const withBreaks = html.replace(
    /<(\/?(?:div|p|li|tr|td|h1|h2|h3|h4|h5|h6|section|article)|br)\b[^>]*>/gi,
    "\n"
  );
  const plain = decodeHtmlEntities(stripHtmlTags(withBreaks));
  const lines = plain
    .split(/\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const signalRe =
    /(price|料金|금액|₩|￥|¥|残り\s*\d+|剩\s*\d+|空室|空室がありません|未找到符合条件的结果|更改搜寻条件|予約する|预订|立即预订|book now|滿室|満室|sold out)/i;

  const pickedIndexes = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    if (!signalRe.test(lines[i])) continue;
    // 带一行上下文，降低单行歧义。
    pickedIndexes.add(Math.max(0, i - 1));
    pickedIndexes.add(i);
    pickedIndexes.add(Math.min(lines.length - 1, i + 1));
  }

  const picked = Array.from(pickedIndexes)
    .sort((a, b) => a - b)
    .map((idx) => lines[idx]);

  const dedup: string[] = [];
  const seen = new Set<string>();
  for (const line of picked) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(line);
    if (dedup.length >= 120) break;
  }

  if (dedup.length > 0) {
    return dedup.join("\n");
  }

  // 兜底：无命中时仍给 AI 一段精简正文，避免完全无输入。
  return plain.slice(0, 8000);
}

function matchGlobalNoResultSignals(evidenceText: string): string[] {
  const normalized = evidenceText.replace(/\s+/g, "");
  const hits: string[] = [];

  if (
    normalized.includes("未找到符合条件的结果。请更改搜寻条件重试。") ||
    normalized.includes("未找到符合条件的结果。请更改搜寻条件重试")
  ) {
    hits.push("cn_no_result_sentence");
  }
  if (normalized.includes("条件に一致する結果が見つかりませんでした")) {
    hits.push("jp_no_result_sentence");
  }
  if (
    normalized.includes("空室ありのみ(0)") ||
    normalized.includes("空室ありのみ（0）")
  ) {
    hits.push("jp_avail_only_zero");
  }
  if (
    normalized.includes("仅显示有空房(0)") ||
    normalized.includes("仅显示有空房（0）")
  ) {
    hits.push("cn_avail_only_zero");
  }
  if (
    normalized.includes("changesearchconditions") ||
    normalized.includes("pleasechangesearchconditions")
  ) {
    hits.push("en_change_search_conditions");
  }

  return hits;
}

function normalizeDigits(input: string): string {
  // 全角数字转半角，便于统一做数值判断。
  return input.replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  );
}

function hasStrongPositiveSignal(evidenceText: string): boolean {
  const normalized = normalizeDigits(evidenceText);

  // 规则1：明确的“余量数字 > 0”。
  const countPatterns = [
    /剩\s*(\d+)\s*间房/g,
    /残り\s*(\d+)\s*室/g,
    /空室\s*[:：]?\s*(\d+)/g,
  ];
  for (const re of countPatterns) {
    for (const m of normalized.matchAll(re)) {
      const n = Number(m[1] ?? "0");
      if (Number.isFinite(n) && n > 0) return true;
    }
  }

  // 规则2：同一房型片段中“价格 + 预订按钮”同时出现（单独出现预订文案不算）。
  const lines = normalized
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const hasPrice = (s: string) =>
    /(₩|￥|¥|KRW|JPY|CNY)\s*[\d,]+/.test(s) || /(?:price|料金)/i.test(s);
  const hasBookAction = (s: string) =>
    /(予約する|立即预订|预订|book now)/i.test(s);

  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i] ?? "";
    const next = lines[i + 1] ?? "";
    if (
      (hasPrice(cur) && hasBookAction(cur)) ||
      (hasPrice(cur) && hasBookAction(next)) ||
      (hasBookAction(cur) && hasPrice(next))
    ) {
      return true;
    }
  }

  return false;
}

function applyStatusGuardrail(
  aiStatus: "有房" | "无房" | "未知",
  evidenceText: string
): "有房" | "无房" | "未知" {
  // 仅在“AI 判无房”时做纠偏，防止模板文案/单房型无房干扰整店判定。
  if (aiStatus !== "无房") return aiStatus;
  const negativeHits = matchGlobalNoResultSignals(evidenceText);
  const hasPositive = hasStrongPositiveSignal(evidenceText);

  // 只要命中强阳性（余量>0 / 预订按钮），优先纠偏为“有房”。
  if (hasPositive) return "有房";
  if (negativeHits.length > 0) return "无房";
  return "无房";
}

async function judgeStatusWithGoogleAi(
  html: string,
  sourceUrl: string
): Promise<AiStatusResult | null> {
  const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY;
  if (!apiKey) return null;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(
    apiKey
  )}`;

  // 先过滤关键信号片段，再送 AI，减少页面噪声与 token 消耗。
  const evidenceText = extractAiEvidenceText(html);
  const clippedEvidenceText = evidenceText.slice(0, 12000);
  const prompt = [
    "你是酒店空房判定器。请做“酒店级”判定，不是“单房型级”判定。",
    "目标：判断该酒店在给定日期是否“至少有一个可预订房型”。",
    "输入不是完整 HTML，而是从页面中筛出的关键片段（价格/余量/预订按钮/无房提示等）。",
    "",
    "关键原则（非常重要）：",
    "A. 某一个房型出现“没有空房/空室がありません/售罄”，不代表整家酒店无房。",
    "B. 只要任意房型出现可预订证据（预订按钮、价格、剩余房量），整店就判定为“有房”。",
    "",
    "判定优先级（严格执行）：",
    "1) 全局无房信号（最高优先级）=> 无房",
    "   仅当页面是“整体无结果/需更改搜索条件/全局无房”时判无房，例如：",
    "   - 未找到符合条件的结果",
    "   - 请更改搜寻条件重试 / Change search conditions",
    "   - 空室ありのみ (0) / 仅显示有空房 (0)",
    "   注意：单个房型的“没有空房”不属于全局无房信号。",
    "",
    "2) 任一房型可订信号 => 有房",
    "   例如：",
    "   - 剩 [数字] 间房 / 残り [数字] 室（数字>0）",
    "   - 房型下出现“预订/予約する”按钮",
    "   - 房型下出现价格（如 ₩ / ￥）且可下单语义成立",
    "",
    "3) 冲突处理：",
    "   - 若同时出现“部分房型无房”与“其他房型可订”，判定“有房”。",
    "   - 只有在没有任何可订信号，且存在明确全局无房信号时，才判“无房”。",
    "   - 证据不足才输出“未知”。",
    "",
    "4) 排除干扰：",
    "   忽略页脚、推荐酒店、会员广告、导航文案，仅看当前酒店房型列表区域。",
    "",
    "只允许返回 JSON，不要 markdown，不要多余文本。",
    'JSON 格式: {"status":"有房|无房|未知","reason":"一句话说明命中的关键证据","evidence":["证据1","证据2"]}',
    `URL: ${sourceUrl}`,
    "关键片段开始:",
    clippedEvidenceText,
  ].join("\n");

  const aiTimeoutMs = Number(process.env.TOYOKO_AI_TIMEOUT_MS ?? "20000");
  const aiRetryCount = Math.max(
    0,
    Number(process.env.TOYOKO_AI_RETRY_COUNT ?? "1")
  );
  let lastErrorType:
    | "http_non_200"
    | "timeout_or_abort"
    | "empty_text"
    | "json_parse_fail"
    | "unknown"
    | undefined;
  let lastHttpStatus: number | undefined;

  for (let attempt = 0; attempt <= aiRetryCount; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), aiTimeoutMs);
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationConfig: {
            temperature: 0,
            topP: 0.1,
            maxOutputTokens: 120,
          },
          contents: [{ parts: [{ text: prompt }] }],
        }),
        signal: controller.signal,
      }).catch(() => null);

      if (!resp) {
        lastErrorType = "timeout_or_abort";
        continue;
      }
      if (!resp.ok) {
        lastErrorType = "http_non_200";
        lastHttpStatus = resp.status;
        continue;
      }
      const json = (await resp.json().catch(() => null)) as
        | {
            candidates?: Array<{
              content?: {
                parts?: Array<{ text?: string }>;
              };
            }>;
          }
        | null;
      const text =
        json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
      if (!text) {
        lastErrorType = "empty_text";
        continue;
      }

      const normalizedText = text
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();
      const parsed = JSON.parse(normalizedText) as Partial<AiStatusResult>;
      if (
        parsed.status === "有房" ||
        parsed.status === "无房" ||
        parsed.status === "未知"
      ) {
        const guardedStatus = applyStatusGuardrail(
          parsed.status,
          clippedEvidenceText
        );
        return {
          status: guardedStatus,
          reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
          evidence: Array.isArray(parsed.evidence)
            ? parsed.evidence.filter((v): v is string => typeof v === "string")
            : undefined,
          debug: {
            raw_preview: normalizedText.slice(0, 200),
          },
        };
      }
      lastErrorType = "json_parse_fail";
    } catch {
      lastErrorType = "json_parse_fail";
    } finally {
      clearTimeout(timeoutId);
    }

    if (attempt < aiRetryCount) {
      await sleep(400 * (attempt + 1));
    }
  }

  return {
    status: "未知",
    reason: "AI 请求失败",
    evidence: [],
    debug: {
      error_type: lastErrorType ?? "unknown",
      http_status: lastHttpStatus,
    },
  };
}

async function fetchToyokoPageMeta(sourceUrl: string): Promise<{
  location: string | null;
  ai_status: "有房" | "无房" | "未知" | null;
  ai_reason: string | null;
  ai_evidence: string[];
  negative_hits: string[];
  positive_hit: boolean;
  ai_error_type: string | null;
  ai_http_status: number | null;
  ai_raw_preview: string | null;
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
    if (!resp?.ok) {
      return {
        location: null,
        ai_status: null,
        ai_reason: null,
        ai_evidence: [],
        negative_hits: [],
        positive_hit: false,
        ai_error_type: "http_non_200",
        ai_http_status: resp?.status ?? null,
        ai_raw_preview: null,
      };
    }
    const html = await resp.text().catch(() => "");
    if (!html) {
      return {
        location: null,
        ai_status: null,
        ai_reason: null,
        ai_evidence: [],
        negative_hits: [],
        positive_hit: false,
        ai_error_type: "empty_html",
        ai_http_status: resp.status,
        ai_raw_preview: null,
      };
    }
    const evidenceText = extractAiEvidenceText(html);
    const aiResult = await judgeStatusWithGoogleAi(html, sourceUrl);
    const negativeHits = matchGlobalNoResultSignals(evidenceText);
    const positiveHit = hasStrongPositiveSignal(evidenceText);

    // AI 空/失败时的确定性兜底，避免整批都“未知”。
    let fallbackStatus: "有房" | "无房" | "未知" = "未知";
    if (positiveHit && negativeHits.length === 0) {
      fallbackStatus = "有房";
    } else if (!positiveHit && negativeHits.length > 0) {
      fallbackStatus = "无房";
    }

    const aiFailed =
      aiResult?.debug?.error_type === "http_non_200" ||
      aiResult?.debug?.error_type === "timeout_or_abort" ||
      aiResult?.debug?.error_type === "empty_text" ||
      aiResult?.debug?.error_type === "json_parse_fail" ||
      aiResult?.debug?.error_type === "unknown";

    const resolvedStatus = aiFailed ? fallbackStatus : aiResult?.status ?? fallbackStatus;

    return {
      location: extractToyokoInnLocationFromHtml(html),
      ai_status: resolvedStatus,
      ai_reason:
        aiFailed && aiResult?.debug?.error_type
          ? `AI失败兜底:${aiResult.debug.error_type}`
          : aiResult?.reason ?? "规则兜底",
      ai_evidence: aiResult?.evidence ?? [],
      negative_hits: negativeHits,
      positive_hit: positiveHit,
      ai_error_type: aiResult?.debug?.error_type ?? null,
      ai_http_status: aiResult?.debug?.http_status ?? null,
      ai_raw_preview: aiResult?.debug?.raw_preview ?? null,
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

      const label = pageMeta.location || labelForHotelId(hotel, hotelLabels);
      // 纯 AI 判定模式：状态仅使用 Google AI 返回结果。
      const resolvedStatus = pageMeta.ai_status ?? "未知";
      console.info("[ToyokoInn][AI]", {
        hotel,
        status: resolvedStatus,
        reason: pageMeta.ai_reason,
        evidence: pageMeta.ai_evidence.slice(0, 3),
        negative_hits: pageMeta.negative_hits,
        positive_hit: pageMeta.positive_hit,
        ai_error_type: pageMeta.ai_error_type,
        ai_http_status: pageMeta.ai_http_status,
        ai_raw_preview: pageMeta.ai_raw_preview,
      });

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

