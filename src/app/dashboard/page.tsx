import { createClient } from "@/src/utils/supabase/server";
import { redirect } from "next/navigation";
import { DashboardSignOut } from "./sign-out-button";
import { SendTestNotificationButton } from "./send-test-notification-button";
import { MonitoringTasksPanel } from "./monitoring-tasks-panel";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">控制台</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        你已通过密码与 MFA 验证（AAL2），可访问受保护内容。
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <SendTestNotificationButton />
      </div>
      <div className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-700">
        <p>
          <span className="text-zinc-500">用户 ID</span>
          <br />
          <span className="break-all font-mono text-xs">{user.id}</span>
        </p>
        {user.email ? (
          <p className="mt-2">
            <span className="text-zinc-500">邮箱</span>
            <br />
            {user.email}
          </p>
        ) : null}
      </div>
      <MonitoringTasksPanel />
      <DashboardSignOut />
    </div>
  );
}
