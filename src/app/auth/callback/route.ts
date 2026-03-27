import { NextResponse } from "next/server";

import { createClient } from "@/src/utils/supabase/server";

/**
 * 邮箱验证链接回调：Supabase 在验证成功后带上 `code`，在此交换会话并跳转。
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const safeNext = next.startsWith("/") ? next : "/dashboard";
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=verify_failed`);
}
