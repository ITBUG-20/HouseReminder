import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 可能提示 middleware → proxy 迁移；在构建未出现致命错误、且 Supabase
 * 等生态示例仍以本文件为主时，可继续沿用 middleware，避免过早迁移踩坑。
 */

const LOGIN_PATH = "/login";
const SIGN_OUT_PATH = "/auth/sign-out";
const CRON_SYNC_PATH = "/api/cron/sync";
const MFA_SETUP_PATH = "/auth/mfa/setup";
const MFA_VERIFY_PATH = "/auth/mfa/verify";
const DASHBOARD_PATH = "/dashboard";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getClaims();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicPath =
    pathname === "/" ||
    pathname === LOGIN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CRON_SYNC_PATH;

  if (!user) {
    if (!isPublicPath) {
      // API 语义：未登录时返回 401 JSON，而不是重定向到页面。
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
      const url = request.nextUrl.clone();
      url.pathname = LOGIN_PATH;
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  if (pathname === LOGIN_PATH) {
    const url = request.nextUrl.clone();
    url.pathname = DASHBOARD_PATH;
    return NextResponse.redirect(url);
  }

  const { data: factorsResult } = await supabase.auth.mfa.listFactors();
  const all = factorsResult?.all ?? [];
  const hasVerifiedTotp =
    (factorsResult?.totp?.length ?? 0) > 0 ||
    all.some(
      (f) => f.factor_type === "totp" && f.status === "verified"
    );

  if (!hasVerifiedTotp) {
    if (pathname !== MFA_SETUP_PATH) {
      const url = request.nextUrl.clone();
      url.pathname = MFA_SETUP_PATH;
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  const { data: aalData } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  const needsMfaStep =
    aalData?.currentLevel === "aal1" && aalData?.nextLevel === "aal2";

  if (needsMfaStep) {
    if (pathname !== MFA_VERIFY_PATH) {
      const url = request.nextUrl.clone();
      url.pathname = MFA_VERIFY_PATH;
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  if (pathname === MFA_SETUP_PATH || pathname === MFA_VERIFY_PATH) {
    const url = request.nextUrl.clone();
    url.pathname = DASHBOARD_PATH;
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
