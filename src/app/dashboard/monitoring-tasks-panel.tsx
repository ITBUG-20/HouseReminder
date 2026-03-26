"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

type MonitoringTask = {
  id: string;
  hotel_name: string;
  location: string;
  monitor_date: string; // YYYY-MM-DD
  status: "无房" | "有房";
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
  const [locationPreset, setLocationPreset] = useState<string>("新加坡");
  const [locationCustom, setLocationCustom] = useState<string>("");
  const [monitorDate, setMonitorDate] = useState("");

  const [tasks, setTasks] = useState<MonitoringTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const pollIntervalMs = useMemo(() => 5000, []);
  const locationValue =
    locationPreset === "其他" ? locationCustom.trim() : locationPreset;

  const locationPresets = [
    "新加坡",
    "香港",
    "台北",
    "北京",
    "上海",
    "广州",
    "深圳",
    "东京",
    "首尔",
    "曼谷",
    "其他",
  ];

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
    await submit();
  }

  async function submit() {
    setMessage(null);

    if (!hotelName.trim()) {
      setMessage("请输入酒店名");
      return;
    }
    if (!locationValue) {
      setMessage("请选择或输入地点");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(monitorDate)) {
      setMessage("请选择日期（YYYY-MM-DD）");
      return;
    }

    setSaving(true);
    try {
      setMessage("正在保存…");
      const resp = await fetch("/api/monitoring/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          hotel_name: hotelName,
          location: locationValue,
          monitor_date: monitorDate,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(text || resp.statusText);
      }

      const json = (await resp.json().catch(() => null)) as
        | { task?: MonitoringTask }
        | null;
      setMessage(
        json?.task
          ? `新增成功：${json.task.hotel_name}（${json.task.status}）`
          : "新增成功，正在刷新列表…"
      );

      // 乐观更新：直接触发一次加载（轮询也会更新）
      await loadTasks();

      setHotelName("");
      setLocationPreset("新加坡");
      setLocationCustom("");
      setMonitorDate("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-[24px] border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
        <h2 className="text-base font-semibold">新增监控</h2>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          提交后写入 Supabase；状态将随扫描结果实时更新（轮询刷新，接近实时）。
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-5 flex flex-col gap-4"
          noValidate
        >
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-600 dark:text-zinc-400">
              酒店名
            </span>
            <input
              value={hotelName}
              onChange={(e) => setHotelName(e.target.value)}
              className="rounded-[16px] border border-zinc-300 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950"
              placeholder="如：Hilton"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-600 dark:text-zinc-400">
              地点（选择模式）
            </span>
            <select
              value={locationPreset}
              onChange={(e) => setLocationPreset(e.target.value)}
              className="rounded-[16px] border border-zinc-300 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950"
            >
              {locationPresets.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            {locationPreset === "其他" ? (
              <input
                value={locationCustom}
                onChange={(e) => setLocationCustom(e.target.value)}
                className="mt-2 rounded-[16px] border border-zinc-300 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950"
                placeholder="输入地点，例如：Bangkok"
              />
            ) : null}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-600 dark:text-zinc-400">
              日期
            </span>
            <input
              type="date"
              value={monitorDate}
              onChange={(e) => setMonitorDate(e.target.value)}
              className="rounded-[16px] border border-zinc-300 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>

          <button
            type="submit"
            disabled={saving}
            className="mt-1 w-fit rounded-[16px] bg-zinc-900 px-5 py-3 text-sm font-medium text-white shadow-sm disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900"
          >
            {saving ? "提交中…" : "新增监控"}
          </button>

          {message ? (
            <p className="text-xs text-zinc-600 dark:text-zinc-400">{message}</p>
          ) : null}
        </form>
      </div>

      <div className="rounded-[24px] border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
        <h2 className="text-base font-semibold">监控任务</h2>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          展示所有监控任务的最新状态。
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-0 border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-200 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                <th className="py-2 pr-4">酒店</th>
                <th className="py-2 pr-4">地点</th>
                <th className="py-2 pr-4">日期</th>
                <th className="py-2 pr-4">状态</th>
                <th className="py-2 pr-4">最后检查</th>
              </tr>
            </thead>
            <tbody>
              {loading && tasks.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="py-3 text-xs text-zinc-600 dark:text-zinc-400"
                  >
                    正在加载…
                  </td>
                </tr>
              ) : null}

              {tasks.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-zinc-100 dark:border-zinc-800"
                >
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
                  <td className="py-2 pr-4 text-xs text-zinc-600 dark:text-zinc-400">
                    {formatDateTime(t.last_check)}
                  </td>
                </tr>
              ))}

              {!loading && tasks.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="py-3 text-xs text-zinc-600 dark:text-zinc-400"
                  >
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

