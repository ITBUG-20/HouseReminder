export type NotificationPayload = {
  /**
   * 业务侧项目标识，用于区分不同业务域的通知模板渲染。
   * 目前由 `NotificationManager.quickNotify()` 默认填充。
   */
  project: string;
  /** 需要发送的主要内容（将映射到模板字段）。 */
  content: string;
  /** 时间字符串（已做格式化，便于模板展示）。 */
  time: string;
};

export interface INotificationProvider {
  /**
   * 发送通知。
   *
   * 实现方应该保证：失败时应记录错误并尽量返回（不要抛出导致主流程中断）。
   */
  send(payload: NotificationPayload): Promise<void>;
}

