"use client";

import { createClient } from "@/src/utils/supabase/client";
import { QRCodeSVG } from "qrcode.react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type TotpPayload = {
  qr_code: string;
  secret: string;
  uri: string;
};

export default function MfaSetupPage() {
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [totp, setTotp] = useState<TotpPayload | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enroll = useCallback(async () => {
    setError(null);
    const supabase = createClient();
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
    });
    setLoading(false);
    if (enrollError) {
      setError(enrollError.message);
      return;
    }
    if (!data || data.type !== "totp" || !("totp" in data)) {
      setError("无法解析 TOTP 注册结果");
      return;
    }
    setFactorId(data.id);
    setTotp(data.totp);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void enroll();
    });
  }, [enroll]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    const trimmed = code.replace(/\s/g, "");
    if (trimmed.length !== 6) {
      setError("请输入 6 位数字验证码");
      return;
    }
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
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

  const qrSvgDataUrl =
    totp &&
    (totp.qr_code.startsWith("data:")
      ? totp.qr_code
      : `data:image/svg+xml;utf-8,${encodeURIComponent(totp.qr_code)}`);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-4 py-16">
      <div>
        <h1 className="text-xl font-semibold">绑定两步验证（TOTP）</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          使用 Authy、Google Authenticator 等应用扫描下方二维码，然后输入 6
          位验证码完成首次绑定。
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">正在生成二维码…</p>
      ) : totp ? (
        <div className="flex flex-col items-center gap-6">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
            <QRCodeSVG value={totp.uri} size={200} level="M" includeMargin />
          </div>
          <p className="text-center text-xs text-zinc-500">
            上图由 <code className="font-mono">qrcode.react</code>{" "}
            根据 <code className="font-mono">totp.uri</code>{" "}
            生成；以下为 Supabase 返回的 <code className="font-mono">totp.qr_code</code>{" "}
           （SVG）预览。
          </p>
          {qrSvgDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrSvgDataUrl}
              alt="Supabase 返回的 TOTP 二维码"
              className="h-[200px] w-[200px]"
            />
          ) : null}
          <details className="w-full text-sm">
            <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">
              无法扫码？查看密钥
            </summary>
            <p className="mt-2 break-all font-mono text-xs">{totp.secret}</p>
          </details>
        </div>
      ) : null}

      <form onSubmit={handleVerify} className="flex flex-col gap-4">
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
          disabled={submitting || !factorId}
          className="rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {submitting ? "验证中…" : "完成绑定"}
        </button>
      </form>
    </div>
  );
}
