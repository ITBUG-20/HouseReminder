import { createClient } from "@/src/utils/supabase/server";
import { NextResponse } from "next/server";

/**
 * 在服务端 Request 上下文中调用 signOut，与 Cookie 存储对齐并撤销 Refresh Token。
 * 客户端仍应再调用一次 `signOut({ scope: "global" })` 以清理浏览器侧状态。
 */
export async function POST() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
