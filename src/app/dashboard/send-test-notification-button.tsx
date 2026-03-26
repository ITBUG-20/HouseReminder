"use client";

import { useState } from "react";

export function SendTestNotificationButton(props?: {
  className?: string;
  hideResult?: boolean;
  /**
   * 在真正发送请求前先执行一段额外逻辑（例如同步 UI 测试数据）。
   * 不应影响网络请求本身；回调异常会被吞掉。
   */
  beforeSend?: () => void | Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function send() {
    setLoading(true);
    setResult(null);

    try {
      // 先更新本地 UI（测试用），避免用户感觉点击“没反应”。
      if (props?.beforeSend) {
        try {
          await props.beforeSend();
        } catch {
          // ignore - 测试回调不应阻断网络请求
        }
      }

      const resp = await fetch("/api/notification/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "通知系统测试：多因素认证 / 仪表盘 链路通畅",
        }),
        credentials: "same-origin",
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        setResult(`发送失败：${text || resp.statusText}`);
        return;
      }

      setResult("发送请求已发出（以通知提供器实现为准）");
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
        className={
          props?.className ??
          "w-fit rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        }
      >
        {loading ? "发送中…" : "发送测试通知"}
      </button>
      {!props?.hideResult && result ? (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">{result}</p>
      ) : null}
    </div>
  );
}

