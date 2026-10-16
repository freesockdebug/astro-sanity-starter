/**
 * Security utilities and sanitizers for user inputs
 */
export class SecurityService {
  /**
   * Encodes HTML special characters to prevent HTML/XSS injection in emails and rendered HTML
   */
  public static escapeHtml(input: unknown): string {
    if (input === null || input === undefined) return '';
    const str = String(input);
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Sanitizes all string fields inside a buyer contact object
   */
  public static sanitizeBuyerInfo<T extends Record<string, any>>(info: T): T {
    if (!info || typeof info !== 'object') return info;
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(info)) {
      if (typeof value === 'string') {
        sanitized[key] = this.escapeHtml(value.trim());
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized as T;
  }
}
