import { fetchToyokoInnAvailabilityFromApi } from "./toyoko-inn-plugin";

export type HotelAvailabilityStatus = "无房" | "有房";

export type HotelFetcherResult = {
  status: HotelAvailabilityStatus;
  hotel_name?: string;
  location?: string;
};

export type HotelTaskInput = {
  hotel_name: string;
  location: string;
  monitor_date: string; // YYYY-MM-DD
  status: HotelAvailabilityStatus;
  source_url?: string | null;
};

function parseToyokoInnAvailabilityFromHtml(
  html: string
): HotelAvailabilityStatus | null {
  // 数字可能存在全角形式，先做一个轻量归一化
  const normalized = html.replace(/[０-９]/g, (d) => {
    const code = d.charCodeAt(0) - 0xff10; // 0
    return String(code);
  });

  // Toyoko Inn 通常会在筛选模式下出现类似：
  // "仅显示有空房 (0)" 或 "筛选仅显示有空房 (0)"
  const countMatch =
    normalized.match(
      /仅显示有空房\s*(?:\(\s*|（\s*)(\d+)\s*(?:\)\s*|）)/i
    ) ??
    normalized.match(
      /有空房\s*(?:\(\s*|（\s*)(\d+)\s*(?:\)\s*|）)/i
    );

  if (countMatch?.[1]) {
    const count = Number(countMatch[1]);
    if (!Number.isNaN(count)) {
      return count > 0 ? "有房" : "无房";
    }
  }

  // 兜底：在该模式下如果出现“没有空房”，通常意味着没有可订房。
  // 注意：Toyoko 页面即使筛选为 0 仍然会包含 “有空房 (0)” 文案；
  // 所以不能仅凭 “有空房” 直接判定有房，必须优先使用 countMatch。
  if (normalized.includes("没有空房")) return "无房";
  if (normalized.includes("有空房") && !normalized.includes("没有空房"))
    return "有房";

  return null;
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

function extractToyokoInnH1(html: string): string | null {
  const matches = html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi);
  for (const m of matches) {
    const raw = m?.[1] ?? "";
    if (!raw) continue;
    const title = decodeHtmlEntities(stripHtmlTags(raw))
      .replace(/\s+/g, " ")
      .trim();
    if (!title) continue;
    // 只接受包含 INN 或横字的标题，避免 JSON-LD 误匹配
    if (title.includes("INN") || title.includes("横") || title.includes("東")) {
      return title;
    }
  }
  return null;
}

function parseToyokoInnHotelLocationFromHtml(
  html: string
): { hotel_name: string; location: string } | null {
  const h1 = extractToyokoInnH1(html);
  if (!h1) return null;

  // 例如：東横INN 首尔永登浦 / 东横INN 首尔永登浦
  const brandCnMatch = h1.match(/([东東]横INN)\s*(.*)$/i);
  if (brandCnMatch?.[1]) {
    const location = (brandCnMatch[2] ?? "")
      .replace(/^[-|·]+/, "")
      .trim();
    if (!location) return null;
    return { hotel_name: "Toyoko Inn", location };
  }

  const brandEnMatch = h1.match(/(Toyoko\s*Inn)\s*(.*)$/i);
  if (brandEnMatch?.[1]) {
    const location = (brandEnMatch[2] ?? "").trim();
    if (!location) return null;
    return { hotel_name: "Toyoko Inn", location };
  }

  return null;
}

async function fetchWithTimeout(
  input: RequestInfo,
  init: RequestInit,
  ms: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 通用的酒店抓取器（当前为随机模拟）。
 *
 * 后续可以把这里替换成：
 * - 调用真实酒店 API
 * - 或者爬虫（使用队列/worker）
 *
 * 注意：该类不负责通知，通知由 `UniversalMonitor` 决策。
 */
export class HotelFetcher {
  async fetchAvailability(task: HotelTaskInput): Promise<HotelFetcherResult> {
    const apiUrl = process.env.HOTEL_AVAILABILITY_API_URL;
    if (!apiUrl) {
      const availableKeywords =
        process.env.HOTEL_SCRAPE_AVAILABLE_KEYWORDS?.split(",")
          .map((s) => s.trim())
          .filter(Boolean) ?? [];
      const unavailableKeywords =
        process.env.HOTEL_SCRAPE_UNAVAILABLE_KEYWORDS?.split(",")
          .map((s) => s.trim())
          .filter(Boolean) ?? [];

      // 未配置真实数据源时，优先尝试：
      // 1) 直接抓取 task.source_url
      // 2) 对 Toyoko Inn 做结构化判定（不依赖关键词 env）
      // 3) 如果配置了 keywords，再按关键词判定
      // 4) 再回退到随机模拟，确保系统可先跑通
      const scrapeTemplate = process.env.HOTEL_SCRAPE_URL_TEMPLATE;
      const timeoutMs = Number(process.env.HOTEL_FETCH_TIMEOUT_MS ?? 8000);

      const fetchHtmlFromUrl = async (url: string): Promise<string> => {
        const resp = await fetchWithTimeout(
          url,
          {
            method: "GET",
            headers: {
              "User-Agent":
                process.env.HOTEL_SCRAPE_USER_AGENT ??
                "Mozilla/5.0 (compatible; NotificationBot/1.0)",
              Accept: "text/html,application/xhtml+xml",
            },
          },
          timeoutMs
        ).catch(() => null);
        if (!resp) return "";
        return await resp.text().catch(() => "");
      };

      let toyokoApiStatus: HotelAvailabilityStatus | null = null;
      if (task.source_url) {
        try {
          const u = new URL(task.source_url);
          if (u.hostname.includes("toyoko-inn.com")) {
            const apiResult = await fetchToyokoInnAvailabilityFromApi(task);
            if (apiResult) {
              toyokoApiStatus = apiResult.status;
            }
          }
        } catch {
          // ignore
        }
      }

      let html = "";
      if (task.source_url) {
        html = await fetchHtmlFromUrl(task.source_url);
      }

      // Toyoko Inn：优先走结构化判定（不依赖关键词 env）
      if (html) {
        try {
          const u = new URL(task.source_url ?? "");
          if (u.hostname.includes("toyoko-inn.com")) {
            const toyokoHtmlStatus = parseToyokoInnAvailabilityFromHtml(
              html
            );
            const statusToUse = toyokoApiStatus ?? toyokoHtmlStatus;
            if (statusToUse) {
              const toyokoMeta = parseToyokoInnHotelLocationFromHtml(html);
              return {
                status: statusToUse,
                hotel_name: toyokoMeta?.hotel_name,
                location: toyokoMeta?.location,
              };
            }
          }
        } catch {
          // ignore
        }
      }

      // 关键词判定（需要配置齐两组关键词）
      if (html && availableKeywords.length && unavailableKeywords.length) {
        const hasAvailable = availableKeywords.some((k) => html.includes(k));
        const hasUnavailable = unavailableKeywords.some((k) =>
          html.includes(k)
        );
        if (hasAvailable && !hasUnavailable) return { status: "有房" };
        if (hasUnavailable && !hasAvailable) return { status: "无房" };
        // 都找不到或冲突：返回无房（避免误报有房）
        return { status: "无房" };
      }

      // 兼容旧模式：如果没有 task.source_url，再尝试模板拼接 URL
      if ((!html || !html.trim()) && scrapeTemplate) {
        const checkin = task.monitor_date;
        const checkout = (() => {
          const d = new Date(`${checkin}T00:00:00`);
          d.setDate(d.getDate() + 1);
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          return `${yyyy}-${mm}-${dd}`;
        })();

        const url = scrapeTemplate
          .replaceAll("{hotel_name}", encodeURIComponent(task.hotel_name))
          .replaceAll("{location}", encodeURIComponent(task.location))
          .replaceAll("{monitor_date}", encodeURIComponent(task.monitor_date))
          .replaceAll("{checkin_date}", encodeURIComponent(checkin))
          .replaceAll("{checkout_date}", encodeURIComponent(checkout));

        html = await fetchHtmlFromUrl(url);

        if (html && availableKeywords.length && unavailableKeywords.length) {
          const hasAvailable = availableKeywords.some((k) => html.includes(k));
          const hasUnavailable = unavailableKeywords.some((k) =>
            html.includes(k)
          );
          if (hasAvailable && !hasUnavailable) return { status: "有房" };
          if (hasUnavailable && !hasAvailable) return { status: "无房" };
          return { status: "无房" };
        }
      }

      // 未配置真实数据源且未配置抓取规则：保持随机模拟，确保系统可先跑通。
      const hasRoom = Math.random() < 0.3;
      return { status: hasRoom ? "有房" : "无房" };
    }

    // 配置了真实数据源：通过 HTTP API 获取空房状态。
    // 约定（你可按此实现自己的服务端接口）：
    // 1) POST ${HOTEL_AVAILABILITY_API_URL}
    //    body: { hotel_name, location, monitor_date }
    // 2) 返回 JSON：
    //    - { available: boolean }
    //      或
    //    - { status: "有房" | "无房" }
    //    或两者混合（优先使用 available）。
    const timeoutMs = Number(process.env.HOTEL_FETCH_TIMEOUT_MS ?? 8000);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.HOTEL_AVAILABILITY_API_KEY
            ? { Authorization: `Bearer ${process.env.HOTEL_AVAILABILITY_API_KEY}` }
            : null),
        },
        body: JSON.stringify({
          hotel_name: task.hotel_name,
          location: task.location,
          monitor_date: task.monitor_date,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        throw new Error(`Hotel API responded with ${resp.status}`);
      }

      const json: unknown = await resp.json().catch(() => null);

      const available =
        (json as { available?: unknown } | null | undefined)?.available;
      const status =
        (json as { status?: unknown } | null | undefined)?.status;

      if (typeof available === "boolean") {
        return { status: available ? "有房" : "无房" };
      }

      if (status === "有房" || status === "无房") {
        return { status };
      }

      // 兜底：无法解析时返回无房（保证扫描链路不断）。
      return { status: "无房" };
    } catch (err) {
      // 抓取失败不应导致整个系统崩溃；返回无房由 UniversalMonitor 继续做 DB 更新。
      console.error("[HotelFetcher] fetchAvailability failed:", err);
      return { status: "无房" };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

