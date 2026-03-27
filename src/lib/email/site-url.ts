/**
 * 用于邮件内链接、Supabase redirectTo 等场景，需与 Supabase 控制台「重定向 URL」白名单一致。
 */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const withProto = vercel.startsWith("http") ? vercel : `https://${vercel}`;
    return withProto.replace(/\/$/, "");
  }

  return "http://localhost:3000";
}
