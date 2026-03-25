import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">首页</h1>
      <p className="max-w-md text-center text-zinc-600 dark:text-zinc-400">
        使用账号密码登录，并按提示完成 MFA 绑定与验证。
      </p>
      <div className="flex gap-4">
        <Link
          href="/login"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          登录
        </Link>
        <Link
          href="/dashboard"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
        >
          控制台
        </Link>
      </div>
    </div>
  );
}
