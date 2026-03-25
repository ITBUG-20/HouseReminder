export type HotelAvailabilityStatus = "无房" | "有房";

export type HotelFetcherResult = {
  status: HotelAvailabilityStatus;
};

export type HotelTaskInput = {
  hotel_name: string;
  location: string;
  monitor_date: string; // YYYY-MM-DD
  status: HotelAvailabilityStatus;
};

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
    // 当前是随机模拟，暂时不使用入参
    void task;
    // 模拟逻辑：30% 概率“有房”，70% 概率“无房”
    const hasRoom = Math.random() < 0.3;
    return { status: hasRoom ? "有房" : "无房" };
  }
}

