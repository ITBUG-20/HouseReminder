import type {
  INotificationProvider,
  NotificationPayload,
} from "./interface";

/**
 * 开发驱动：仅打印通知内容到终端，便于本地验证链路。
 */
export class ConsoleNotificationProvider
  implements INotificationProvider
{
  async send(payload: NotificationPayload): Promise<void> {
    // 这里不抛错，保证通知发送失败不会中断业务主流程。
    console.log("[Notification][Console]", payload);
  }
}

