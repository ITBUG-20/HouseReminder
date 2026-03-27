import { NextResponse } from "next/server";

import { getWeakPasswordReason } from "@/src/lib/auth/weak-password";
import { sendSignupVerificationEmail } from "@/src/lib/email/send-signup-verification";
import { createAdminClient } from "@/src/utils/supabase/admin";

function mapSupabaseRegisterError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("already") && m.includes("registered")) {
    return "该邮箱已注册，请直接登录";
  }
  if (m.includes("already been registered")) {
    return "该邮箱已注册，请直接登录";
  }
  if (m.includes("user already exists")) {
    return "该邮箱已注册，请直接登录";
  }
  return message;
}

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "请输入有效的邮箱地址" }, { status: 400 });
  }
  if (!password) {
    return NextResponse.json({ error: "请输入密码" }, { status: 400 });
  }

  const weak = getWeakPasswordReason(password);
  if (weak) {
    return NextResponse.json({ error: weak }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({
      type: "signup",
      email,
      password,
    });

    if (error) {
      return NextResponse.json(
        { error: mapSupabaseRegisterError(error.message) },
        { status: 400 }
      );
    }

    const otpCode = data?.properties?.email_otp;
    if (!otpCode) {
      return NextResponse.json(
        { error: "无法生成验证码，请稍后重试" },
        { status: 500 }
      );
    }
    if (otpCode.length !== 6) {
      const uid = data?.user?.id;
      if (uid) {
        await admin.auth.admin.deleteUser(uid);
      }
      return NextResponse.json(
        { error: "当前验证码不是 6 位，请在 Supabase Auth 设置中将 OTP 长度改为 6 位后重试" },
        { status: 500 }
      );
    }

    try {
      await sendSignupVerificationEmail({ to: email, otpCode });
    } catch (sendErr) {
      const uid = data?.user?.id;
      if (uid) {
        await admin.auth.admin.deleteUser(uid);
      }
      throw sendErr;
    }

    return NextResponse.json({ ok: true, needOtpVerify: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "注册失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
