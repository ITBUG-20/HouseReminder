"use client";

import { createClient } from "@/src/utils/supabase/client";
import { getWeakPasswordReason } from "@/src/lib/auth/weak-password";
import { Eye, EyeOff, LogOut } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";

function LoginFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const verifyError = searchParams.get("error");
  const supabase = createClient();

  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [focused, setFocused] = useState<string | null>(null);
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registerEmailSent, setRegisterEmailSent] = useState(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(6).fill(""));
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        if (password !== confirmPassword) {
          setError("两次密码不一致");
          return;
        }
        const weakReason = getWeakPasswordReason(password);
        if (weakReason) {
          setError(weakReason);
          return;
        }

        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          ok?: boolean;
          needOtpVerify?: boolean;
        };

        if (!res.ok) {
          setError(json.error ?? "注册失败，请稍后重试");
          return;
        }

        setRegisterEmailSent(true);
        setError(null);
        return;
      }

      const { error: signError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signError) {
        const msg = signError.message.toLowerCase();
        if (
          msg.includes("email not confirmed") ||
          msg.includes("not confirmed")
        ) {
          setError("请先点击邮件中的链接完成邮箱验证，再登录。");
          return;
        }
        setError(signError.message);
        return;
      }

      router.refresh();
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    setError(null);
    const token = otpDigits.join("").trim();
    if (!token || token.length !== 6) {
      setError("请输入 6 位验证码");
      return;
    }

    setLoading(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token,
        type: "signup",
      });
      if (verifyError) {
        setError(verifyError.message);
        return;
      }
      router.refresh();
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }

  function setOtpAt(index: number, value: string) {
    setOtpDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function handleOtpChange(index: number, raw: string) {
    const value = raw.replace(/\D/g, "");
    if (!value) {
      setOtpAt(index, "");
      return;
    }
    const digit = value.slice(-1);
    setOtpAt(index, digit);
    if (index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKeyDown(
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>
  ) {
    if (event.key === "Backspace") {
      if (otpDigits[index]) {
        setOtpAt(index, "");
        return;
      }
      if (index > 0) {
        otpRefs.current[index - 1]?.focus();
        setOtpAt(index - 1, "");
      }
      return;
    }
    if (event.key === "ArrowLeft" && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
    if (event.key === "ArrowRight" && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpPaste(event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const text = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    const next = Array(6).fill("") as string[];
    text.split("").forEach((ch, i) => {
      next[i] = ch;
    });
    setOtpDigits(next);
    const target = Math.min(text.length, 6) - 1;
    if (target >= 0) {
      otpRefs.current[target]?.focus();
    }
  }

  const urlHint =
    verifyError === "verify_failed"
      ? "验证链接无效或已过期，请重新注册或联系管理员。"
      : null;

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#f8f6f3]">
      {/* Ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#5c5650]/5 rounded-full blur-3xl" />

      {/* Glass card */}
      <div className="relative glass rounded-3xl p-12 w-full max-w-md animate-fade-in">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Email field */}
          <div className="relative">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocused("email")}
              onBlur={() => setFocused(null)}
              className="w-full bg-transparent border-0 border-b border-[#c5c0b8] rounded-none px-0 py-3 text-[#4a453f] placeholder:text-[#a8a298] focus:ring-0 focus:border-[#7a746c] transition-colors"
              placeholder="邮箱"
              autoComplete="email"
              required={!isRegister}
              disabled={registerEmailSent}
            />
            <div
              className={`absolute bottom-0 left-0 h-px bg-[#5c5650] transition-all duration-500 ${
                focused === "email" ? "w-full" : "w-0"
              }`}
            />
          </div>

          {/* Password field */}
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFocused("password")}
              onBlur={() => setFocused(null)}
              className="w-full bg-transparent border-0 border-b border-[#c5c0b8] rounded-none px-0 py-3 pr-10 text-[#4a453f] placeholder:text-[#a8a298] focus:ring-0 focus:border-[#7a746c] transition-colors"
              placeholder="密码"
              autoComplete={isRegister ? "new-password" : "current-password"}
              required={!isRegister}
              disabled={registerEmailSent}
            />

            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-0 top-1/2 -translate-y-1/2 text-[#a8a298] hover:text-[#5c5650] transition-colors"
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>

            <div
              className={`absolute bottom-0 left-0 h-px bg-[#5c5650] transition-all duration-500 ${
                focused === "password" ? "w-full" : "w-0"
              }`}
            />
          </div>

          {/* Confirm password field - only show in register mode */}
          {isRegister && !registerEmailSent && (
            <div className="relative animate-fade-in">
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onFocus={() => setFocused("confirm")}
                onBlur={() => setFocused(null)}
                className="w-full bg-transparent border-0 border-b border-[#c5c0b8] rounded-none px-0 py-3 text-[#4a453f] placeholder:text-[#a8a298] focus:ring-0 focus:border-[#7a746c] transition-colors"
                placeholder="确认密码"
              />
              <div
                className={`absolute bottom-0 left-0 h-px bg-[#5c5650] transition-all duration-500 ${
                  focused === "confirm" ? "w-full" : "w-0"
                }`}
              />
            </div>
          )}

          {registerEmailSent ? (
            <div className="flex items-center justify-center gap-2 animate-fade-in">
              {otpDigits.map((digit, idx) => (
                <input
                  key={`otp-${idx}`}
                  ref={(el) => {
                    otpRefs.current[idx] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(idx, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                  onPaste={handleOtpPaste}
                  placeholder="0"
                  aria-label={`验证码第${idx + 1}位`}
                  disabled={loading}
                  className="w-10 h-12 text-center bg-transparent border border-[#c5c0b8] rounded-lg text-[#4a453f] placeholder:text-[#a8a298] focus:outline-none focus:border-[#7a746c] transition-colors font-mono tracking-widest disabled:opacity-60 disabled:cursor-not-allowed"
                />
              ))}
            </div>
          ) : null}

          {urlHint && !registerEmailSent ? (
            <p className="text-sm text-red-600 dark:text-red-400">{urlHint}</p>
          ) : null}

          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : null}

          {/* Submit button */}
          {!registerEmailSent ? (
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 mt-6 text-[#5c5650] hover:text-[#4a453f] text-sm tracking-[0.2em] uppercase transition-colors duration-300 disabled:opacity-60"
            >
              {loading ? "加载中..." : isRegister ? "注册" : "进入"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleVerifyOtp}
              disabled={loading}
              className="w-full py-4 mt-6 text-[#5c5650] hover:text-[#4a453f] text-sm tracking-[0.2em] uppercase transition-colors duration-300"
            >
              {loading ? "验证中..." : "验证并继续"}
            </button>
          )}

          {/* Toggle login/register */}
          {!registerEmailSent ? (
            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setIsRegister(!isRegister);
                  setError(null);
                }}
                className="text-xs text-[#a8a298] hover:text-[#7a746c] tracking-wide transition-colors"
              >
                {isRegister ? "已有账号？登录" : "没有账号？注册"}
              </button>
            </div>
          ) : null}
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

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#f8f6f3] text-[#a8a298] text-sm">
          加载中...
        </div>
      }
    >
      <LoginFormInner />
    </Suspense>
  );
}
