"use client";

import { createClient } from "@/src/utils/supabase/client";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

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

  const inputRefs = useRef<Array<HTMLInputElement | null>>(
    Array.from({ length: 6 }).map(() => null),
  );

  function setDigitAt(index: number, digit: string) {
    // 仅保留单个数字字符（输入法偶发返回空字符串时也能正常工作）
    const d = digit.replace(/\D/g, "").slice(-1);
    setCode((prev) => {
      const chars = prev.replace(/\D/g, "").split("");
      while (chars.length < 6) chars.push("");
      chars[index] = d;
      return chars.join("");
    });
  }

  function handleDigitChange(index: number, raw: string) {
    const d = raw.replace(/\D/g, "").slice(-1);
    setDigitAt(index, d);
    if (d && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleDigitKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Backspace") return;

    const current = (code[index] ?? "").replace(/\D/g, "");
    if (current) return; // 当前格有值，交给浏览器默认退格即可

    if (index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    if (e.clipboardData.files?.length) return;
    const text = e.clipboardData.getData("text") ?? "";
    const digits = text.replace(/\D/g, "").slice(0, 6).split("");
    if (digits.length === 0) return;

    setCode((prev) => {
      const chars = prev.replace(/\D/g, "").split("");
      while (chars.length < 6) chars.push("");
      for (let i = 0; i < 6; i++) chars[i] = digits[i] ?? "";
      return chars.join("");
    });

    // 填完后聚焦最后一个有值的位置（或最后一格）
    const lastFilled = Math.min(digits.length - 1, 5);
    inputRefs.current[lastFilled]?.focus();
    e.preventDefault();
  }

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

    const current = aalData?.currentLevel ?? "未知";
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
      setError("未找到已验证的时间一次性密码因子，请先完成绑定。");
    }
  }, [router]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  // UI 现在只展示验证码输入与按钮；aalLabel/factors 仍用于初始化选中因子与安全校验。
  void aalLabel;
  void factors;

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
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#f8f6f3]">
      {/* Ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#5c5650]/5 rounded-full blur-3xl" />

      {/* Glass card */}
      <div className="relative glass rounded-3xl p-12 w-full max-w-md animate-fade-in">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <h1 className="text-xl font-semibold text-[#4a453f]">多因素验证</h1>
            <p className="mt-2 text-sm text-[#8a8278]">
              您已绑定多因素认证，请输入验证器中的6 位代码完成本次登录
            </p>
          </div>

          {loading ? (
            <p className="text-sm text-[#a8a298]">正在读取会话与因子…</p>
          ) : (
            <>
              <div className="flex flex-col gap-3 items-center">
                <div className="flex items-center justify-center gap-2">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <input
                      key={index}
                      ref={(el) => {
                        inputRefs.current[index] = el;
                      }}
                      inputMode="numeric"
                      autoComplete={index === 0 ? "one-time-code" : "off"}
                      pattern="\d*"
                      maxLength={1}
                      value={code[index] ?? ""}
                      onChange={(e) => handleDigitChange(index, e.target.value)}
                      onKeyDown={(e) => handleDigitKeyDown(index, e)}
                      onPaste={handlePaste}
                      placeholder="0"
                      disabled={submitting || !selectedFactorId}
                      aria-label={`验证码第${index + 1}位`}
                      className="w-10 h-12 text-center bg-transparent border border-[#c5c0b8] rounded-lg text-[#4a453f] placeholder:text-[#a8a298] focus:outline-none focus:border-[#7a746c] transition-colors font-mono tracking-widest disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  ))}
                </div>
              </div>

              {error ? (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              ) : null}

              <button
                type="submit"
                disabled={submitting || !selectedFactorId}
                className="w-full py-4 mt-6 text-[#5c5650] hover:text-[#4a453f] text-sm tracking-[0.2em] uppercase transition-colors duration-300 disabled:opacity-60"
              >
                {submitting ? "正在验证..." : "进入"}
              </button>
            </>
          )}
        </form>
      </div>

      {/* Back hint */}
      <button
        type="button"
        onClick={() => router.push("/")}
        className="absolute top-8 left-8 text-[#5c5650] hover:text-[#4a453f] transition-colors text-xs tracking-[0.2em]"
      >
        <LogOut className="w-4 h-4 -rotate-180" />
      </button>
    </div>
  );
}
