/**
 * MFA「管理员重置」示例（勿把 service_role 密钥提交到仓库）
 *
 * 场景：用户删掉了验证器里的条目，仍卡在 /auth/mfa/verify，需要人工清掉其 MFA 因子。
 *
 * 做法一（推荐先查文档）：Supabase Dashboard → SQL Editor，在确认表名与版本后，
 * 对 auth  schema 中 MFA 相关表做针对性 DELETE（具体表名以你项目 Postgres 为准）。
 *
 * 做法二：使用 service_role 的 Admin API（若当前 @supabase/supabase-js 版本已暴露
 * 删除因子接口），或自建 Edge Function 调用 Auth Admin。
 *
 * 下面仅保留占位，避免误运行；需要时请复制为 admin-reset-mfa.ts 并自行补全。
 */

/*
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  const userId = process.argv[2];
  if (!userId) {
    throw new Error("用法: npx tsx scripts/admin-reset-mfa.ts <user_uuid>");
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 按官方文档查询 Admin MFA / 或直接 SQL 删除 auth.mfa_factors 等表中该 user_id 的行
  void admin;
  void userId;
}

void main();
*/
