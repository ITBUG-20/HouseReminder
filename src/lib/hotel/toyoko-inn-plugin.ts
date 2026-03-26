type HotelAvailabilityStatus = "无房" | "有房";

type HotelFetcherResult = {
  status: HotelAvailabilityStatus;
  hotel_name?: string;
  location?: string;
};

type HotelTaskInput = {
  hotel_name: string;
  location: string;
  monitor_date: string; // YYYY-MM-DD
  status: HotelAvailabilityStatus;
  source_url?: string | null;
};

type ToyokoRoomPlanItem = {
  is_vacant?: unknown;
  room_count?: unknown;
};

type ToyokoApiResponse = {
  room_plan_list?: unknown;
};

function toNumber(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string") {
    const n = Number(input);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function toBoolean(input: unknown): boolean | null {
  if (typeof input === "boolean") return input;
  if (typeof input === "number" && Number.isFinite(input)) {
    if (input === 1) return true;
    if (input === 0) return false;
  }
  if (typeof input === "string") {
    const s = input.trim().toLowerCase();
    if (s === "true" || s === "1") return true;
    if (s === "false" || s === "0") return false;
  }
  return null;
}

function inferToyokoVacancy(item: ToyokoRoomPlanItem): boolean | null {
  const rec = item as Record<string, unknown>;
  const direct = toBoolean(rec.is_vacant ?? rec.isVacant ?? null);
  if (direct !== null) return direct;

  for (const [k, v] of Object.entries(rec)) {
    const key = k.toLowerCase();
    if (key.includes("vacant") || key.includes("空房")) {
      const b = toBoolean(v);
      if (b !== null) return b;
    }
  }

  return null;
}

function inferToyokoRoomCount(item: ToyokoRoomPlanItem): number | null {
  const rec = item as Record<string, unknown>;
  const direct = toNumber(
    rec.room_count ?? rec.roomCount ?? rec.room_num ?? rec.roomNum ?? null
  );
  if (direct !== null) return direct;

  for (const [k, v] of Object.entries(rec)) {
    const key = k.toLowerCase();
    const looksLikeCount =
      (key.includes("room") && key.includes("count")) ||
      (key.includes("vacant") && key.includes("count")) ||
      (key.includes("available") && key.includes("count"));
    if (looksLikeCount) {
      const n = toNumber(v);
      if (n !== null) return n;
    }
  }

  return null;
}

function computeEndFromStart(startYMD: string): string | null {
  try {
    const d = new Date(`${startYMD}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function parseToyokoParams(task: HotelTaskInput): {
  hotel: string;
  start: string;
  end: string;
  room: number;
  people: number;
  smoking: string;
} | null {
  const urlStr = task.source_url;
  if (!urlStr) return null;

  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    return null;
  }

  const hotel = u.searchParams.get("hotel") ?? "";
  const start = u.searchParams.get("start") ?? task.monitor_date ?? "";
  const end =
    u.searchParams.get("end") ??
    computeEndFromStart(start) ??
    task.monitor_date ??
    "";

  const room = u.searchParams.get("room") ?? "1";
  const people = u.searchParams.get("people") ?? "2";
  const smoking = u.searchParams.get("smoking") ?? "noSmoking";

  const roomNum = Number(room);
  const peopleNum = Number(people);

  if (!hotel) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
  if (!Number.isFinite(roomNum) || !Number.isFinite(peopleNum)) return null;

  return {
    hotel,
    start,
    end,
    room: roomNum,
    people: peopleNum,
    smoking,
  };
}

/**
 * Toyoko Inn：使用你指定的接口 `POST /api/v1/search/room_plan/` 判定有/无房。
 *
 * 反爬处理：
 * - 如果接口返回 403/503，说明被拦截：在日志中提示“需要更新 Cookie 或更换 IP”
 * - 然后返回 null，让上层回退到 HTML 解析/关键词策略
 */
export async function fetchToyokoInnAvailabilityFromApi(
  task: HotelTaskInput
): Promise<HotelFetcherResult | null> {
  const params = parseToyokoParams(task);
  if (!params) return null;

  const userAgent =
    process.env.HOTEL_SCRAPE_USER_AGENT ??
    "Mozilla/5.0 (compatible; NotificationBot/1.0)";

  const resp = await fetch(
    "https://www.toyoko-inn.com/api/v1/search/room_plan/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": userAgent,
      },
      body: JSON.stringify({
        hotel: params.hotel,
        start: params.start,
        end: params.end,
        room: params.room,
        people: params.people,
        smoking: params.smoking,
      }),
    }
  ).catch(() => null);

  if (!resp) return null;

  if (resp.status === 403 || resp.status === 503) {
    console.warn(
      "[ToyokoInn] 请求被拦截（403/503），需要更新 Cookie 或更换 IP"
    );
    return null;
  }

  if (!resp.ok) return null;

  const json: ToyokoApiResponse | null = (await resp.json().catch(
    () => null
  )) as ToyokoApiResponse | null;

  const list = (json?.room_plan_list ?? null) as
    | ToyokoRoomPlanItem[]
    | null;

  if (!Array.isArray(list)) return null;

  for (const item of list) {
    const isVacant = inferToyokoVacancy(item);
    const roomCount = inferToyokoRoomCount(item);

    if (isVacant === true) return { status: "有房" };
    if (roomCount !== null && roomCount > 0) return { status: "有房" };
  }

  return { status: "无房" };
}

