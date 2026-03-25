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
  async startScan(): Promise<ScanResult> {
    const supabase = createAdminClient();
    const fetcher = new HotelFetcher();
    const notifier = new NotificationManager();

    const { data: tasks, error } = await supabase
      .from("monitoring_tasks")
      .select("id, hotel_name, location, monitor_date, status, is_active, last_check")
      .eq("is_active", true)
      .order("monitor_date", { ascending: true });

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

        const { error: updateError } = await supabase
          .from("monitoring_tasks")
          .update({
            status: nextStatus,
            last_check: getNowIso(),
          })
          .eq("id", task.id);

        if (updateError) {
          // 更新失败不应阻塞后续任务扫描
          console.error("[UniversalMonitor] update failed:", updateError);
        }
      } catch (err) {
        // 单条任务失败不阻塞整体
        console.error("[UniversalMonitor] scan item failed:", err);
      }
    }

    return {
      scanned: list.length,
      changed,
      notified,
    };
  }
}

