/**
 * 客户端与注册 API 共用的弱密码校验。
 */
export function getWeakPasswordReason(password: string): string | null {
  if (password.length < 8) {
    return "密码强度过低：至少需要 8 位字符";
  }
  if (!/[A-Z]/.test(password)) {
    return "密码强度过低：至少包含 1 个大写字母";
  }
  if (!/[a-z]/.test(password)) {
    return "密码强度过低：至少包含 1 个小写字母";
  }
  if (!/\d/.test(password)) {
    return "密码强度过低：至少包含 1 个数字";
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "密码强度过低：至少包含 1 个特殊字符";
  }

  const lowered = password.toLowerCase();
  const weakParts = ["123456", "password", "qwerty", "admin", "111111"];
  if (weakParts.some((w) => lowered.includes(w))) {
    return "密码强度过低：包含常见弱密码片段";
  }

  return null;
}
