"use client";

import { useEffect, useState } from "react";
import { MonitoringTasksPanel } from "./monitoring-tasks-panel";

/**
 * 为了避免 SSR 期间渲染的 Client Component 与首轮客户端渲染不一致，
 * 这里在 `useEffect` 挂载后才真正渲染面板。
 */
export function ClientOnlyMonitoringTasksPanel() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  if (!mounted) return null;

  return <MonitoringTasksPanel />;
}

