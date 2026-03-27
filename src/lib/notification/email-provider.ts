import { Resend } from "resend";

import { createAdminClient } from "@/src/utils/supabase/admin";
import type {
  INotificationProvider,
  NotificationPayload,
} from "./interface";

function resolveFromAddress(): string {
  return process.env.RESEND_FROM?.trim() || "noreply@morego.store";
}

async function resolveRegisteredRecipients(): Promise<string[]> {
  const admin = createAdminClient();
  const emails = new Set<string>();

  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) {
      throw new Error(error.message);
    }

    const users = data?.users ?? [];
    for (const user of users) {
      if (!user.email) continue;
      if (!user.email_confirmed_at) continue;
      emails.add(user.email.trim().toLowerCase());
    }

    if (users.length < perPage) break;
    page += 1;
    if (page > 50) break;
  }

  return Array.from(emails);
}

/**
 * 邮件通知提供器（基于 Resend）。
 * - 不抛出异常，避免影响主业务流程。
 * - 收件人支持逗号分隔多个邮箱。
 */
export class EmailNotificationProvider implements INotificationProvider {
  private readonly apiKey: string | undefined;
  private readonly from: string;
  private readonly recipients: string[];

  constructor(options?: {
    apiKey?: string;
    from?: string;
    recipients?: string[];
  }) {
    this.apiKey = options?.apiKey ?? process.env.RESEND_API_KEY;
    this.from = options?.from ?? resolveFromAddress();
    this.recipients = options?.recipients ?? [];
  }

  async send(payload: NotificationPayload): Promise<void> {
    try {
      if (!this.apiKey) {
        console.error(
          "[Notification][Email] Missing RESEND_API_KEY, skip send."
        );
        return;
      }
      const dynamicRecipients =
        this.recipients.length > 0
          ? this.recipients
          : await resolveRegisteredRecipients();

      if (!dynamicRecipients.length) {
        console.error(
          "[Notification][Email] No confirmed registered users, skip send."
        );
        return;
      }

      const resend = new Resend(this.apiKey);
      const subject = `[${payload.project}] 酒店监控通知`;

      const { error } = await resend.emails.send({
        from: this.from,
        to: dynamicRecipients,
        subject,
        html: `
          <div style="font-family: system-ui, sans-serif; line-height: 1.6; color: #333;">
            <p><strong>项目：</strong>${payload.project}</p>
            <p><strong>时间：</strong>${payload.time}</p>
            <p><strong>内容：有房速抢！</strong></p>
            <pre style="white-space: pre-wrap; margin: 0; font-size: 14px;">${payload.content}</pre>
          </div>
        `,
      });

      if (error) {
        console.error("[Notification][Email] send failed:", error.message);
      }
    } catch (err) {
      console.error("[Notification][Email] unexpected error:", err);
    }
  }
}

