import { getRuntimeEnv } from './auth';

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
   * Resolves and validates visitor 2-letter ISO country code from Cloudflare request headers.
   * Filters out reserved pseudocodes (e.g. 'XX', 'T1') and non-alphabetic inputs.
   */
  public static resolveCountry(request: Request): string {
    const raw = (request.headers.get('cf-ipcountry') || (request as any).cf?.country || '').trim().toUpperCase();
    return /^[A-Z]{2}$/.test(raw) && raw !== 'XX' && raw !== 'T1' ? raw : '';
  }

  /**
   * Validates outbound webhook URLs against SSRF (Server-Side Request Forgery).
   * Enforces HTTPS protocol, standard port 443, and blocks loopback, link-local, IPv6 and private ranges.
   */
  public static isSafeWebhookUrl(rawUrl: string): boolean {
    if (!rawUrl || typeof rawUrl !== 'string') return false;
    try {
      const parsed = new URL(rawUrl.trim());
      if (parsed.protocol !== 'https:') return false;
      // Disallow non-standard ports (e.g. internal admin :8080, redis :6379)
      if (parsed.port && parsed.port !== '443') return false;

      const rawHostname = parsed.hostname.toLowerCase();
      const hostname = rawHostname.replace(/^\[|\]$/g, '');

      // Block local/internal hostnames
      if (
        hostname === 'localhost' ||
        hostname === '0.0.0.0' ||
        hostname.endsWith('.local') ||
        hostname.endsWith('.internal')
      ) {
        return false;
      }

      // Block integer / octal / hex encoded IPs (e.g. 2130706433, 0177.0.0.1, 0x7f000001)
      if (/^\d+$/.test(hostname) || /^0x[0-9a-f]+$/i.test(hostname)) {
        return false;
      }

      // Block IPv6 loopback, link-local (fe80::/10), unique-local (fc00::/7), and IPv4-mapped IPv6 (::ffff:0:0/96)
      if (
        hostname === '::1' ||
        hostname === '0:0:0:0:0:0:0:1' ||
        hostname === '::' ||
        /^f[cd][0-9a-f]{2}:/i.test(hostname) ||
        /^fe[89ab][0-9a-f]:/i.test(hostname) ||
        hostname.startsWith('::ffff:')
      ) {
        return false;
      }

      // Block private, loopback, and cloud metadata IPv4 ranges
      if (
        /^127\./.test(hostname) ||
        /^0\./.test(hostname) ||
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
   * Constant-time comparison to prevent timing side-channel attacks on secret tokens
   */
  public static timingSafeEqual(a: string, b: string): boolean {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const aBytes = new TextEncoder().encode(a);
    const bBytes = new TextEncoder().encode(b);
    if (aBytes.byteLength !== bBytes.byteLength) return false;
    let diff = 0;
    for (let i = 0; i < aBytes.byteLength; i++) {
      diff |= aBytes[i] ^ bBytes[i];
    }
    return diff === 0;
  }

  /**
   * Single source of truth to resolve client network and geo metadata
   */
  public static resolveClientMeta(request: Request): {
    ip: string;
    country: string;
    city: string;
    userAgent: string;
  } {
    const ip =
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-real-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      '';
    const country =
      this.resolveCountry(request) ||
      (request.headers.get('cf-ipcountry') || (request as any).cf?.country || '').trim().toUpperCase();
    const city = (request as any).cf?.city || request.headers.get('cf-ipcity') || '';
    const userAgent = request.headers.get('user-agent') || '';
    return { ip, country, city, userAgent };
  }

  /**
   * Sanitizes raw SVG strings for safe rendering via set:html
   * Strips <script>, <iframe>, <object>, <embed>, on* inline handlers, and javascript: pseudo-protocols
   */
  public static sanitizeSvg(input: unknown): string {
    if (!input || typeof input !== 'string') return '';
    const trimmed = input.trim();
    if (!trimmed.toLowerCase().startsWith('<svg') || !trimmed.toLowerCase().endsWith('</svg>')) {
      return '';
    }
    return trimmed
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
      .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
      .replace(/\s+on\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '')
      .replace(/(href|src|xlink:href)\s*=\s*["']?\s*javascript:[^"'>]*/gi, '$1="#"');
  }

  /**
   * Extract apex/root domain from hostname (e.g. 'admin.example.com' -> 'example.com')
   * Accounts for multi-tenant serverless platforms and common two-part TLDs (e.g. .co.uk, .pages.dev)
   */
  private static extractRootDomain(hostname: string): string {
    const parts = hostname.toLowerCase().split('.');
    if (parts.length <= 2) return hostname.toLowerCase();

    // Prevent multi-tenant platforms & 2-level TLDs from being treated as shared apex root
    const multiTenantOrTwoLevel = [
      'co.uk',
      'com.cn',
      'net.cn',
      'org.cn',
      'pages.dev',
      'workers.dev',
      'run.app',
      'vercel.app',
      'netlify.app',
    ];
    const lastTwo = parts.slice(-2).join('.');
    if (multiTenantOrTwoLevel.includes(lastTwo) && parts.length >= 3) {
      return parts.slice(-3).join('.');
    }
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

    const envConfiguredDomains = [
      getRuntimeEnv('ALLOWED_ORIGIN_DOMAINS'),
      getRuntimeEnv('SITE_DOMAIN'),
      getRuntimeEnv('TURNSTILE_HOSTNAMES'),
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
          // Allow apex domain and any of its own subdomains (e.g. admin.yourdomain.com)
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

export const resolveCountryFromRequest = (request: Request) => SecurityService.resolveCountry(request);


