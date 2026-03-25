"use client";

import { useState } from "react";

export function SendTestNotificationButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function send() {
    setLoading(true);
    setResult(null);

    try {
      const resp = await fetch("/api/notification/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "通知系统测试：MFA / dashboard 链路通畅",
        }),
        credentials: "same-origin",
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        setResult(`发送失败：${text || resp.statusText}`);
        return;
      }

      setResult("发送请求已发出（以 provider 实现为准）");
    } catch (err) {
      setResult(err instanceof Error ? err.message : "发送失败（未知错误）");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => void send()}
        disabled={loading}
        className="w-fit rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {loading ? "发送中…" : "发送测试通知"}
      </button>
      {result ? (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">{result}</p>
      ) : null}
    </div>
  );
}

