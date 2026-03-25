import { createClient } from "@supabase/supabase-js";

/**
 * 管理端 Supabase 客户端（使用 service role）。
 *
 * 仅用于后端（如 cron 扫描、管理脚本、需要绕过 RLS 的场景）。
 *
 * 重要：请确保 `SUPABASE_SERVICE_ROLE_KEY` 只存在于服务器环境变量，
 * 不要提交到仓库。
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!serviceRoleKey) {
    throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

