"use client";

import { createClient } from "@/src/utils/supabase/client";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

export function DashboardSignOut(props?: {
  label?: string;
  className?: string;
  children?: ReactNode;
  "aria-label"?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    try {
      const res = await fetch("/auth/sign-out", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        console.error(
          "服务端退出失败:",
          body?.error ?? res.statusText
        );
      }

      const supabase = createClient();
      const { error: clientError } = await supabase.auth.signOut({
        scope: "global",
      });
      if (clientError) {
        console.error("客户端退出失败:", clientError.message);
      }
    } finally {
      setLoading(false);
      router.refresh();
      router.push("/login");
    }
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={loading}
      aria-label={props?.["aria-label"]}
      className={
        props?.className ??
        "w-fit rounded-lg p-1 text-[#c5c0b8] hover:text-[#8a8278] hover:bg-black/5 disabled:opacity-50 transition-colors"
      }
    >
      {loading ? (
        "退出中…"
      ) : props?.children ? (
        props.children
      ) : (
        props?.label ?? "退出登录"
      )}
    </button>
  );
}
