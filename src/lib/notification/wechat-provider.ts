import type {
  INotificationProvider,
  NotificationPayload,
} from "./interface";

type WechatTokenResponse = {
  access_token?: string;
  expires_in?: number;
  errcode?: number;
  errmsg?: string;
};

type WechatSendResponse = {
  errcode?: number;
  errmsg?: string;
};

async function fetchWithTimeout(input: RequestInfo, init: RequestInit, ms: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 微信模板消息提供器（策略实现）。
 *
 * 注意：Token 缓存目前未实现（每次都会向微信拉取 access_token）。
 * TODO(优化): 实现内存缓存或持久化缓存（带过期时间），避免频繁请求。
 */
export class WechatNotificationProvider
  implements INotificationProvider
{
  private readonly appId: string | undefined;
  private readonly appSecret: string | undefined;
  private readonly templateId: string | undefined;
  private readonly receiverOpenId: string | undefined;

  constructor(options?: {
    appId?: string;
    appSecret?: string;
    templateId?: string;
    receiverOpenId?: string;
  }) {
    this.appId = options?.appId;
    this.appSecret = options?.appSecret;
    this.templateId = options?.templateId;
    this.receiverOpenId = options?.receiverOpenId;
  }

  private async getAccessToken(): Promise<string | null> {
    if (!this.appId || !this.appSecret) return null;

    const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
    url.searchParams.set("grant_type", "client_credential");
    url.searchParams.set("appid", this.appId);
    url.searchParams.set("secret", this.appSecret);

    const resp = await fetchWithTimeout(
      url.toString(),
      { method: "GET" },
      8000
    ).catch((err) => {
      // 不阻塞主流程：记录错误后返回 null
      console.error("[Notification][Wechat] getAccessToken timeout/error:", err);
      return null;
    });

    if (!resp) return null;

    const json = (await resp.json().catch(() => null)) as
      | WechatTokenResponse
      | null;

    if (!json?.access_token) return null;
    if (typeof json.errcode !== "undefined") return null;

    return json.access_token;
  }

  async send(payload: NotificationPayload): Promise<void> {
    try {
      // 用于测试/排障：确认已经进入微信 provider 分支。
      // 注意：此处不打印 access_token / appSecret / 明文 token。
      console.log("[Notification][Wechat] send invoked", {
        project: payload.project,
      });

      const token = await this.getAccessToken();
      if (!token) {
        console.error(
          "[Notification][Wechat] Missing access_token or env config, skip send."
        );
        return;
      }

      if (!this.templateId || !this.receiverOpenId) {
        console.error(
          "[Notification][Wechat] Missing templateId/receiverOpenId, skip send."
        );
        return;
      }

      const url = new URL(
        "https://api.weixin.qq.com/cgi-bin/message/template/send"
      );
      url.searchParams.set("access_token", token);

      // 这里的 `data` 字段名需要与微信模板字段（keyword1/2/...）保持一致。
      // 目前使用：keyword1=content, keyword2=time, first=project
      const body = {
        touser: this.receiverOpenId,
        template_id: this.templateId,
        url: "",
        topcolor: "#000000",
        data: {
          first: { value: payload.project },
          keyword1: { value: payload.content },
          keyword2: { value: payload.time },
        },
      };

      const resp = await fetchWithTimeout(
        url.toString(),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        8000
      ).catch((err) => {
        console.error("[Notification][Wechat] send timeout/error:", err);
        return null;
      });

      if (!resp) return;

      const json = (await resp.json().catch(() => null)) as
        | WechatSendResponse
        | null;

      if (typeof json?.errcode !== "undefined") {
        console.error(
          "[Notification][Wechat] send failed:",
          json?.errcode,
          json?.errmsg
        );
      }
    } catch (err) {
      // 不抛错，确保通知失败不会影响主流程。
      console.error("[Notification][Wechat] unexpected error:", err);
    }
  }
}

