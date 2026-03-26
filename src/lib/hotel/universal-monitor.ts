import { NotificationManager } from "../notification/manager";
import { createAdminClient } from "../../utils/supabase/admin";
import { HotelFetcher } from "./hotel-fetcher";
import type {
  HotelTaskInput,
  HotelAvailabilityStatus,
} from "./hotel-fetcher";
import type { MonitoringTaskRow } from "./types";

type ScanResult = {
  scanned: number;
  changed: number;
  notified: number;
};

function getNowIso() {
  return new Date().toISOString();
}

export class UniversalMonitor {
  /**
   * 扫描所有 `is_active = true` 的任务。
   */
  async startScan(options?: { taskIds?: string[] }): Promise<ScanResult> {
    const supabase = createAdminClient();
    const fetcher = new HotelFetcher();
    const notifier = new NotificationManager();

    let query = supabase
      .from("monitoring_tasks")
      .select(
        "id, hotel_name, location, monitor_date, status, is_active, last_check, source_url"
      )
      .eq("is_active", true)
      .order("monitor_date", { ascending: true });

    if (options?.taskIds && options.taskIds.length) {
      query = query.in("id", options.taskIds);
    }

    const { data: tasks, error } = await query;

    if (error) {
      throw error;
    }

    const list: MonitoringTaskRow[] = (tasks ?? []) as MonitoringTaskRow[];

    let changed = 0;
    let notified = 0;

    for (const task of list) {
      try {
        const input: HotelTaskInput = {
          hotel_name: task.hotel_name,
          location: task.location,
          monitor_date: task.monitor_date,
          status: task.status,
          source_url: task.source_url ?? null,
        };

        const prevStatus = task.status as HotelAvailabilityStatus;
        const next = await fetcher.fetchAvailability(input);
        const nextStatus = next.status;

        if (prevStatus === "无房" && nextStatus === "有房") {
          await notifier.quickNotify(
            `酒店“${task.hotel_name}”（${task.location}）${task.monitor_date}：检测到有房`
          );
          notified += 1;
        }

        if (prevStatus !== nextStatus) {
          changed += 1;
        }

        const patch: Record<string, unknown> = {
          status: nextStatus,
          last_check: getNowIso(),
        };

        if (next.hotel_name && next.hotel_name !== task.hotel_name) {
          patch.hotel_name = next.hotel_name;
        }
        if (next.location && next.location !== task.location) {
          patch.location = next.location;
        }

        await supabase
          .from("monitoring_tasks")
          .update(patch)
          .eq("id", task.id);

        // 更新失败不应阻塞后续任务扫描
      } catch {
        // 单条任务失败不阻塞整体
        // 确保即使抓取失败也能更新 last_check，避免任务看起来“卡死”。
        const prevStatus = task.status as HotelAvailabilityStatus;
        await supabase
          .from("monitoring_tasks")
          .update({
            status: prevStatus,
            last_check: getNowIso(),
          })
          .eq("id", task.id);
      }
    }

    return {
      scanned: list.length,
      changed,
      notified,
    };
  }
}

