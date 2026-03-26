"use client";

import { useEffect, useRef, useState } from "react";
import { SendTestNotificationButton } from "./send-test-notification-button";
import { DashboardSignOut } from "./sign-out-button";
import { LogOut } from "lucide-react";

export function NotificationNButton(props: {
  userId: string;
  userEmail: string | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={ref} className="fixed bottom-6 left-6 z-50">
      <button
        type="button"
        aria-label="通知操作"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-black text-white shadow-sm transition hover:opacity-90"
      >
        <span className="text-sm font-semibold">N</span>
      </button>

      {open ? (
        <div className="mt-3 w-80 rounded-[24px] border border-zinc-200 bg-white p-4 shadow-sm">
          <div>
            <p className="break-all text-xs font-mono text-zinc-900">
              {props.userId}
            </p>
            {props.userEmail ? (
              <p className="mt-1 text-xs text-zinc-600">{props.userEmail}</p>
            ) : null}
          </div>

          <div className="mt-4">
            <SendTestNotificationButton
              hideResult={true}
              className="w-full rounded-[16px] bg-black px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            />
          </div>

          <div className="mt-3">
            <DashboardSignOut
              aria-label="退出"
              className="w-full flex items-center justify-center rounded-[16px] px-3 py-2 text-[#c5c0b8] hover:text-[#8a8278] hover:bg-black/5 disabled:opacity-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </DashboardSignOut>
          </div>
        </div>
      ) : null}
    </div>
  );
}

