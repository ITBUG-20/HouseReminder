import type {
  INotificationProvider,
  NotificationPayload,
} from "./interface";
import { ConsoleNotificationProvider } from "./console-provider";
import { EmailNotificationProvider } from "./email-provider";
import { WechatNotificationProvider } from "./wechat-provider";

type NotificationType = "EMAIL" | "WECHAT" | "CONSOLE";

function getEnv(key: string): string | undefined {
  return process.env[key];
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * 将时间格式化为：YYYY-MM-DD HH:mm:ss
 * 这样对模板展示更友好，也便于排查问题。
 */
function formatTime(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate()
  )} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(
    date.getSeconds()
  )}`;
}

export class NotificationManager {
  private readonly provider: INotificationProvider;
  private readonly providerType: NotificationType;

  constructor(type?: NotificationType) {
    const envTypeRaw = getEnv("NOTIFICATION_TYPE");
    const envTypeNormalized = envTypeRaw?.trim().toUpperCase();
    const resolvedType = (
      type ??
      (envTypeNormalized as NotificationType | undefined)
    );

    if (resolvedType === "EMAIL") {
      const provider = new EmailNotificationProvider({
        apiKey: getEnv("RESEND_API_KEY"),
        from: getEnv("RESEND_FROM"),
      });
      this.provider = provider;
      this.providerType = "EMAIL";
    } else if (resolvedType === "WECHAT") {
      const provider = new WechatNotificationProvider({
        appId: getEnv("WECHAT_APP_ID"),
        appSecret: getEnv("WECHAT_APP_SECRET"),
        templateId: getEnv("WECHAT_TEMPLATE_ID"),
        receiverOpenId: getEnv("WECHAT_RECEIVER_OPENID"),
      });
      this.provider = provider;
      this.providerType = "WECHAT";
    } else {
      // 默认使用控制台，避免环境变量缺失导致线上失败。
      this.provider = new ConsoleNotificationProvider();
      this.providerType = "CONSOLE";
    }
  }

  getProviderType(): NotificationType {
    return this.providerType;
  }

  /**
   * 快速通知：封装默认的接收人（由 provider 内部从环境变量读取）和时间格式。
   */
  async quickNotify(content: string): Promise<void> {
    const now = new Date();
    const payload: NotificationPayload = {
      // 项目标识目前无强制 env，默认使用固定值，后续可扩展成 NOTIFICATION_PROJECT
      project: getEnv("NOTIFICATION_PROJECT") ?? "default-project",
      content,
      time: formatTime(now),
    };

    await this.provider.send(payload);
  }
}

