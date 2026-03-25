import { NextResponse } from "next/server";
import { NotificationManager } from "@/src/lib/notification/manager";

export async function POST(req: Request) {
  // 提供可选的 content，用于按钮输入时自定义；默认值用于快速验证。
  const body: unknown = await req.json().catch(() => null);
  const content =
    typeof (body as { content?: unknown } | null)?.content === "string"
      ? (body as { content: string }).content
      : "通知系统测试：MFA / dashboard 链路通畅";

  const manager = new NotificationManager();
  await manager.quickNotify(content);

  return NextResponse.json({ ok: true });
}

