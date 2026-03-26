"use client";

import { useEffect, useState } from "react";
import { SendTestNotificationButton } from "./send-test-notification-button";

/**
 * 同步解决 hydration mismatch：首轮输出为 null，mount 后再渲染按钮。
 */
export function ClientOnlySendTestNotificationButton() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  if (!mounted) return null;

  return <SendTestNotificationButton />;
}

