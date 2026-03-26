"use client";

import { createClient } from "@/src/utils/supabase/client";
import { Eye, EyeOff, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [focused, setFocused] = useState<string | null>(null);
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();

    try {
      if (isRegister) {
        if (password !== confirmPassword) {
          setError("两次密码不一致");
          return;
        }
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) {
          setError(signUpError.message);
          return;
        }
        router.push("/login");
        return;
      }

      const { error: signError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signError) {
        setError(signError.message);
        return;
      }

      router.refresh();
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }

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
            />

            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-0 top-1/2 -translate-y-1/2 text-[#a8a298] hover:text-[#5c5650] transition-colors"
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
          {isRegister && (
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

          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : null}

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 mt-6 text-[#5c5650] hover:text-[#4a453f] text-sm tracking-[0.2em] uppercase transition-colors duration-300 disabled:opacity-60"
          >
            {loading ? "加载中..." : isRegister ? "注册" : "进入"}
          </button>

          {/* Toggle login/register */}
          <div className="text-center">
            <button
              type="button"
              onClick={() => setIsRegister(!isRegister)}
              className="text-xs text-[#a8a298] hover:text-[#7a746c] tracking-wide transition-colors"
            >
              {isRegister ? "已有账号？登录" : "没有账号？注册"}
            </button>
          </div>
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
