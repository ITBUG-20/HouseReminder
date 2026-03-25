"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

type Status = "无房" | "有房";

type MonitoringTask = {
  id: string;
  hotel_name: string;
  location: string;
  monitor_date: string; // YYYY-MM-DD
  status: Status;
  is_active: boolean;
  last_check: string | null;
};

function formatDateTime(input: string | null): string {
  if (!input) return "—";
  try {
    return new Date(input).toLocaleString();
  } catch {
    return input;
  }
}

export function MonitoringTasksPanel() {
  const [hotelName, setHotelName] = useState("");
  const [location, setLocation] = useState("");
  const [monitorDate, setMonitorDate] = useState("");
  const [status, setStatus] = useState<Status>("无房");
  const [isActive, setIsActive] = useState(true);

  const [tasks, setTasks] = useState<MonitoringTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const pollIntervalMs = useMemo(() => 5000, []);

  async function loadTasks() {
    setLoading(true);
    try {
      const resp = await fetch("/api/monitoring/tasks", {
        method: "GET",
        credentials: "same-origin",
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(text || resp.statusText);
      }
      const json = (await resp.json()) as { tasks: MonitoringTask[] };
      setTasks(json.tasks ?? []);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTasks();
    const id = setInterval(() => {
      void loadTasks();
    }, pollIntervalMs);
    return () => clearInterval(id);
  }, [pollIntervalMs]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!hotelName.trim()) {
      setMessage("请输入酒店名");
      return;
    }
    if (!location.trim()) {
      setMessage("请输入地点");
      return;
    }
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(monitorDate)) {
      setMessage("请选择日期（YYYY-MM-DD）");
      return;
    }

    setSaving(true);
    try {
      const resp = await fetch("/api/monitoring/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          hotel_name: hotelName,
          location,
          monitor_date: monitorDate,
          status,
          is_active: isActive,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(text || resp.statusText);
      }

      setMessage("新增成功，正在刷新列表…");

      // 乐观更新：直接触发一次加载（轮询也会更新）
      await loadTasks();

      setHotelName("");
      setLocation("");
      setMonitorDate("");
      setStatus("无房");
      setIsActive(true);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-8 flex flex-col gap-6">
      <div className="rounded-lg border border-zinc-200 p-5 text-sm dark:border-zinc-700">
        <h2 className="text-base font-semibold">新增监控</h2>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          提交后将写入 Supabase，并在下方列表展示实时状态。
        </p>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-600 dark:text-zinc-400">
              酒店名
            </span>
            <input
              value={hotelName}
              onChange={(e) => setHotelName(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900"
              placeholder="如：Hilton"
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-600 dark:text-zinc-400">
              地点
            </span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900"
              placeholder="如：Singapore"
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-600 dark:text-zinc-400">
              日期
            </span>
            <input
              type="date"
              value={monitorDate}
              onChange={(e) => setMonitorDate(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900"
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-600 dark:text-zinc-400">
              状态
            </span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900"
            >
              <option value="无房">无房</option>
              <option value="有房">有房</option>
            </select>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span className="text-xs text-zinc-700 dark:text-zinc-300">
              是否激活
            </span>
          </label>

          <button
            type="submit"
            disabled={saving}
            className="w-fit rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {saving ? "提交中…" : "新增监控"}
          </button>

          {message ? (
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              {message}
            </p>
          ) : null}
        </form>
      </div>

      <div className="rounded-lg border border-zinc-200 p-5 text-sm dark:border-zinc-700">
        <h2 className="text-base font-semibold">Dashboard</h2>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          展示所有监控任务的最新状态（轮询刷新，接近实时）。
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[740px] border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-200 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                <th className="py-2 pr-4">酒店</th>
                <th className="py-2 pr-4">地点</th>
                <th className="py-2 pr-4">日期</th>
                <th className="py-2 pr-4">状态</th>
                <th className="py-2 pr-4">激活</th>
                <th className="py-2 pr-4">最后检查</th>
              </tr>
            </thead>
            <tbody>
              {loading && tasks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-3 text-xs text-zinc-600">
                    正在加载…
                  </td>
                </tr>
              ) : null}

              {tasks.map((t) => (
                <tr key={t.id} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="py-2 pr-4">{t.hotel_name}</td>
                  <td className="py-2 pr-4">{t.location}</td>
                  <td className="py-2 pr-4">{t.monitor_date}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={
                        t.status === "有房"
                          ? "font-semibold text-green-700 dark:text-green-300"
                          : "font-semibold text-zinc-500 dark:text-zinc-400"
                      }
                    >
                      {t.status}
                    </span>
                  </td>
                  <td className="py-2 pr-4">{t.is_active ? "是" : "否"}</td>
                  <td className="py-2 pr-4 text-xs text-zinc-600 dark:text-zinc-400">
                    {formatDateTime(t.last_check)}
                  </td>
                </tr>
              ))}

              {!loading && tasks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-3 text-xs text-zinc-600">
                    暂无监控任务
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

