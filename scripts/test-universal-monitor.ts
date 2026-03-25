import { createAdminClient } from "../src/utils/supabase/admin";
import { UniversalMonitor } from "../src/lib/hotel/universal-monitor";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatYMD(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate()
  )}`;
}

async function main() {
  // ts-node 在此运行环境下可能不会自动加载 .env.local。
  // 为保证测试可复现，这里手动读取并填充 process.env。
  const envPath = resolve(process.cwd(), ".env.local");
  const envRaw = readFileSync(envPath, "utf8");
  console.log("[TestUniversalMonitor] env loaded:", {
    envPath,
    hasUrl: envRaw.includes("NEXT_PUBLIC_SUPABASE_URL="),
    hasAnonKey: envRaw.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY="),
    hasServiceRoleKey: envRaw.includes("SUPABASE_SERVICE_ROLE_KEY="),
  });
  for (const line of envRaw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    // 避免将内容错误地包含引号
    const unquoted =
      value.startsWith('"') && value.endsWith('"')
        ? value.slice(1, -1)
        : value.startsWith("'") && value.endsWith("'")
          ? value.slice(1, -1)
          : value;
    process.env[key] = unquoted;
  }

  console.log("[TestUniversalMonitor] process.env present:", {
    hasUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    hasAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  });

  const supabase = createAdminClient();

  const today = formatYMD(new Date());

  // 以无房起步，确保在模拟抓取返回“有房”时会触发通知。
  const insert = await supabase
    .from("monitoring_tasks")
    .insert({
      hotel_name: `测试酒店-${Date.now()}`,
      location: "测试地点",
      monitor_date: today,
      status: "无房",
      is_active: true,
    })
    .select("id, status, is_active, hotel_name")
    .single();

  if (insert.error) {
    console.error("[TestUniversalMonitor] insert failed:", insert.error);
    return;
  }

  console.log("[TestUniversalMonitor] inserted:", insert.data);

  const monitor = new UniversalMonitor();
  const result = await monitor.startScan();

  console.log("[TestUniversalMonitor] scan result:", result);
}

void main();

