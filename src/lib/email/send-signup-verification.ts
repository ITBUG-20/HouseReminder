import { Resend } from "resend";

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error("缺少环境变量 RESEND_API_KEY");
    }
    resendClient = new Resend(key);
  }
  return resendClient;
}

function getFromAddress(): string {
  const from = process.env.RESEND_FROM?.trim();
  if (from) return from;
  return "noreply@morego.store";
}

/**
 * 通过 Resend 发送注册验证码邮件（使用 Supabase Admin generateLink 返回的 email_otp）。
 */
export async function sendSignupVerificationEmail(params: {
  to: string;
  otpCode: string;
}): Promise<void> {
  const { to, otpCode } = params;

  const resend = getResend();
  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to,
    subject: "注册验证码",
    html: `
      <div style="font-family: system-ui, sans-serif; line-height: 1.6; color: #4a453f; max-width: 480px;">
        <p>您好，</p>
        <p>感谢您注册。请在登录页面输入下方 6 位验证码完成邮箱验证：</p>
        <p style="margin: 20px 0; font-size: 28px; letter-spacing: 0.4em; font-weight: 700; color: #2f2a24;">
          ${otpCode}
        </p>
      </div>
    `,
  });

  if (error) {
    throw new Error(error.message);
  }
}
