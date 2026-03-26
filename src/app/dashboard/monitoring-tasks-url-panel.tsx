"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type MonitoringTask = {
  id: string;
  hotel_name: string;
  location: string;
  monitor_date: string; // YYYY-MM-DD
  status: "无房" | "有房";
  last_check: string | null;
  source_url?: string | null;
};

function formatDateTime(input: string | null): string {
  if (!input) return "—";
  try {
    return new Date(input).toLocaleString();
  } catch {
    return input;
  }
}

function isValidHttpUrl(input: string): boolean {
  try {
    const u = new URL(input);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function MonitoringTasksURLPanel() {
  const [sourceUrl, setSourceUrl] = useState("");
  const [tasks, setTasks] = useState<MonitoringTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const pollIntervalMs = useMemo(() => 5000, []);

  async function readErrorMessage(resp: Response): Promise<string> {
    try {
      const json = (await resp.json()) as unknown;
      if (
        json &&
        typeof json === "object" &&
        "error" in json &&
        typeof (json as { error?: unknown }).error === "string"
      ) {
        return (json as { error: string }).error;
      }
    } catch {
      // ignore
    }
    try {
      const text = await resp.text().catch(() => "");
      return text || resp.statusText;
    } catch {
      return resp.statusText;
    }
  }

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/monitoring/tasks", {
        method: "GET",
        credentials: "same-origin",
      });
      if (!resp.ok) {
        throw new Error(await readErrorMessage(resp));
      }
      const json = (await resp.json()) as { tasks: MonitoringTask[] };
      setTasks(json.tasks ?? []);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks();
    const id = setInterval(() => {
      void loadTasks();
    }, pollIntervalMs);
    return () => clearInterval(id);
  }, [pollIntervalMs, loadTasks]);

  async function submit() {
    setMessage(null);

    if (!sourceUrl.trim()) {
      setMessage("请输入酒店最终URL");
      return;
    }
    if (!isValidHttpUrl(sourceUrl.trim())) {
      setMessage("URL 格式不正确（需 http/https）");
      return;
    }

    setSaving(true);
    try {
      setMessage("正在保存…");
      const resp = await fetch("/api/monitoring/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ source_url: sourceUrl.trim() }),
      });

      if (!resp.ok) {
        throw new Error(await readErrorMessage(resp));
      }

      const json = (await resp.json().catch(() => null)) as
        | { task?: MonitoringTask }
        | null;

      setMessage(
        json?.task
          ? `新增成功：${json.task.hotel_name}（${json.task.status}）`
          : "新增成功，正在刷新列表…"
      );

      setSourceUrl("");
      await loadTasks();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function delTask(id: string) {
    setMessage(null);
    setSaving(true);
    try {
      const resp = await fetch("/api/monitoring/tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id }),
      });
      if (!resp.ok) {
        throw new Error(await readErrorMessage(resp));
      }
      setMessage("已删除，正在刷新…");
      await loadTasks();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "删除失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-[24px] border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-600 dark:text-zinc-400">
              酒店最终 URL
            </span>
            <input
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              className="rounded-[16px] border border-zinc-300 bg-white px-4 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              placeholder="粘贴酒店选定日期后的最终链接"
            />
          </label>

          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="w-fit rounded-[16px] bg-black px-5 py-3 text-sm font-medium text-white shadow-sm disabled:opacity-60"
          >
            {saving ? "处理中…" : "新增监控"}
          </button>

          {message ? (
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              {message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="rounded-[24px] border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-zinc-900">
            监控任务
          </h2>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-0 border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-200 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                <th className="py-2 pr-4">酒店</th>
                <th className="py-2 pr-4">地点</th>
                <th className="py-2 pr-4">日期</th>
                <th className="py-2 pr-4">状态</th>
                <th className="py-2 pr-4">最后检查</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {loading && tasks.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
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
                  <td className="py-2 pr-4">
                    <button
                      type="button"
                      onClick={() => void delTask(t.id)}
                      disabled={saving}
                      className="rounded-[12px] border border-zinc-200 px-3 py-1 text-xs text-zinc-900 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}

              {!loading && tasks.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
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

