"use client";

import { createClient } from "@/src/utils/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function DashboardSignOut() {
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
      className="w-fit rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-600 dark:hover:bg-zinc-800"
    >
      {loading ? "退出中…" : "退出登录"}
    </button>
  );
}
