"use client";

import { createClient } from "@/src/utils/supabase/client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type ListedFactor = {
  id: string;
  factor_type: string;
  status: string;
  friendly_name?: string;
};

export default function MfaVerifyPage() {
  const router = useRouter();
  const [aalLabel, setAalLabel] = useState<string | null>(null);
  const [factors, setFactors] = useState<ListedFactor[]>([]);
  const [selectedFactorId, setSelectedFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const supabase = createClient();

    const { data: aalData, error: aalError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError) {
      setLoading(false);
      setError(aalError.message);
      return;
    }

    const current = aalData?.currentLevel ?? "unknown";
    const next = aalData?.nextLevel ?? "—";
    setAalLabel(`当前 AAL：${current}，下一级：${next}`);

    if (aalData?.currentLevel === "aal2") {
      setLoading(false);
      router.replace("/dashboard");
      return;
    }

    const { data: listData, error: listError } =
      await supabase.auth.mfa.listFactors();
    setLoading(false);
    if (listError) {
      setError(listError.message);
      return;
    }

    const all = listData?.all ?? [];
    setFactors(all);

    const verifiedTotp =
      listData?.totp?.filter((f) => f.status === "verified") ?? [];
    const first = verifiedTotp[0];
    if (first) {
      setSelectedFactorId(first.id);
    } else {
      setError("未找到已验证的 TOTP 因子，请先完成绑定。");
    }
  }, [router]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFactorId) return;
    const trimmed = code.replace(/\s/g, "");
    if (trimmed.length !== 6) {
      setError("请输入 6 位数字验证码");
      return;
    }
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: selectedFactorId,
      code: trimmed,
    });
    setSubmitting(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    router.refresh();
    router.replace("/dashboard");
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-4 py-16">
      <div>
        <h1 className="text-xl font-semibold">两步验证</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          你已绑定 MFA，请输入验证器中的 6 位代码以完成本次登录（升至 AAL2）。
        </p>
        {aalLabel ? (
          <p className="mt-2 text-xs font-mono text-zinc-500">{aalLabel}</p>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">正在读取会话与因子…</p>
      ) : (
        <>
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
            <p className="text-sm font-medium">已有因子</p>
            <ul className="mt-2 space-y-2 text-sm">
              {factors.map((f) => (
                <li
                  key={f.id}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <span>
                    {f.friendly_name ?? f.factor_type}{" "}
                    <span className="text-zinc-500">({f.status})</span>
                  </span>
                  {f.factor_type === "totp" && f.status === "verified" ? (
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="radio"
                        name="factor"
                        checked={selectedFactorId === f.id}
                        onChange={() => setSelectedFactorId(f.id)}
                      />
                      使用此项
                    </label>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span>6 位验证码</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono tracking-widest dark:border-zinc-600 dark:bg-zinc-900"
                placeholder="000000"
              />
            </label>
            {error ? (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            ) : null}
            <button
              type="submit"
              disabled={submitting || !selectedFactorId}
              className="rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {submitting ? "验证中…" : "验证并继续"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
