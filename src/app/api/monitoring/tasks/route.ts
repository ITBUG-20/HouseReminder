import { createClient } from "@/src/utils/supabase/server";
import { createAdminClient } from "@/src/utils/supabase/admin";
import { NextResponse } from "next/server";

type CreateMonitoringTaskBody = {
  hotel_name: string;
  location: string;
  monitor_date: string; // YYYY-MM-DD
  status: "无房" | "有房";
  is_active: boolean;
};

function isISODate(input: string): boolean {
  // 简单校验：YYYY-MM-DD
  return /^\\d{4}-\\d{2}-\\d{2}$/.test(input);
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 使用 admin client 读取，避免未配置 RLS 时导致列表为空。
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("monitoring_tasks")
    .select("id, hotel_name, location, monitor_date, status, is_active, last_check")
    .order("monitor_date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tasks: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 写入使用 admin client，避免未配置 RLS/policy 时无法创建任务。
  const admin = createAdminClient();

  const body: unknown = await req.json().catch(() => null);
  const b = body as Partial<CreateMonitoringTaskBody> | null;

  if (
    !b ||
    typeof b.hotel_name !== "string" ||
    typeof b.location !== "string" ||
    typeof b.monitor_date !== "string" ||
    !isISODate(b.monitor_date) ||
    (b.status !== "无房" && b.status !== "有房") ||
    typeof b.is_active !== "boolean"
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid payload: expect hotel_name, location, monitor_date(YYYY-MM-DD), status('无房'|'有房'), is_active(boolean).",
      },
      { status: 400 }
    );
  }

  const { data, error } = await admin
    .from("monitoring_tasks")
    .insert({
      // 避免依赖数据库默认的 `gen_random_uuid()`（需要 pgcrypto）。
      // 使用服务端生成 UUID，确保表即使没启用 pgcrypto 也能插入。
      id: crypto.randomUUID(),
      hotel_name: b.hotel_name,
      location: b.location,
      monitor_date: b.monitor_date,
      status: b.status,
      is_active: b.is_active,
    })
    .select("id, hotel_name, location, monitor_date, status, is_active, last_check")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ task: data });
}

