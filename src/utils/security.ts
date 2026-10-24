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

  /**
   * Validates outbound webhook URLs against SSRF (Server-Side Request Forgery).
   * Enforces HTTPS protocol and blocks loopback, link-local, and private network ranges.
   */
  public static isSafeWebhookUrl(rawUrl: string): boolean {
    if (!rawUrl || typeof rawUrl !== 'string') return false;
    try {
      const parsed = new URL(rawUrl.trim());
      if (parsed.protocol !== 'https:') return false;

      const hostname = parsed.hostname.toLowerCase();
      if (
        hostname === 'localhost' ||
        hostname === '0.0.0.0' ||
        hostname === '[::1]' ||
        hostname.endsWith('.local') ||
        hostname.endsWith('.internal')
      ) {
        return false;
      }

      // Block private, loopback, and cloud metadata IPv4 ranges
      if (
        /^127\./.test(hostname) ||
        /^10\./.test(hostname) ||
        /^192\.168\./.test(hostname) ||
        /^169\.254\./.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
      ) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Extract apex/root domain from hostname (e.g. 'admin.example.com' -> 'example.com')
   */
  private static extractRootDomain(hostname: string): string {
    const parts = hostname.toLowerCase().split('.');
    if (parts.length <= 2) return hostname.toLowerCase();
    return parts.slice(-2).join('.');
  }

  /**
   * Generates strict, trusted-origin CORS headers dynamically from runtime request URL and environment variables
   */
  public static getCorsHeaders(
    request?: Request,
    currentUrl?: URL,
    allowedMethods = 'GET, POST, OPTIONS',
    allowedHeaders = 'Content-Type, Authorization, X-Webhook-Secret, X-Revalidate-Secret, x-sanity-webhook-secret'
  ): Record<string, string> {
    const origin = request?.headers.get('origin');
    const currentHost = currentUrl?.hostname?.toLowerCase() || '';
    const rootDomain = currentHost ? this.extractRootDomain(currentHost) : '';

    const getEnv = (key: string): string | undefined =>
      (typeof process !== 'undefined' && process.env && (process.env as any)[key]) ||
      (import.meta.env && (import.meta.env as any)[key]);

    const envConfiguredDomains = [
      getEnv('ALLOWED_ORIGIN_DOMAINS'),
      getEnv('SITE_DOMAIN'),
      getEnv('TURNSTILE_HOSTNAMES'),
    ]
      .filter(Boolean)
      .join(',')
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);

    // Only allow specific trusted apex root domains, never wildcard multi-tenant platforms (e.g. *.workers.dev)
    const trustedDomainSet = new Set<string>(['sanity.studio']);
    if (rootDomain) trustedDomainSet.add(rootDomain);
    if (currentHost) trustedDomainSet.add(currentHost);
    for (const d of envConfiguredDomains) {
      trustedDomainSet.add(d);
    }

    let isAllowedOrigin = false;
    if (origin) {
      try {
        const originHost = new URL(origin).hostname.toLowerCase();
        if (originHost === 'localhost' || originHost === '127.0.0.1' || originHost.endsWith('.local')) {
          isAllowedOrigin = true;
        } else if (rootDomain && (originHost === rootDomain || originHost.endsWith(`.${rootDomain}`))) {
          // Allow apex domain and any of its own subdomains (e.g. admin.gwenvenni.com)
          isAllowedOrigin = true;
        } else {
          // Explicit full-host match only for external configurations
          for (const trusted of trustedDomainSet) {
            if (originHost === trusted) {
              isAllowedOrigin = true;
              break;
            }
          }
        }
      } catch {
        isAllowedOrigin = false;
      }
    }

    const headers: Record<string, string> = {
      'Access-Control-Allow-Methods': allowedMethods,
      'Access-Control-Allow-Headers': allowedHeaders,
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
      'X-Content-Type-Options': 'nosniff',
    };

    if (isAllowedOrigin && origin) {
      headers['Access-Control-Allow-Origin'] = origin;
    }

    return headers;
  }
}


