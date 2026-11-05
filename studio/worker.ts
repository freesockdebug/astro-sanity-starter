interface Env {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
  SITE_ORIGIN?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Forward API requests to the Astro SSR site
    if (url.pathname.startsWith('/api/')) {
      const defaultOrigin = url.hostname.startsWith('admin.')
        ? `${url.protocol}//${url.hostname.replace(/^admin\./, '')}`
        : (url.hostname === 'localhost' || url.hostname === '127.0.0.1'
            ? `${url.protocol}//${url.hostname}:4321`
            : 'https://gwenvenni.com');

      const siteOrigin = env.SITE_ORIGIN || defaultOrigin;
      const targetUrl = new URL(url.pathname + url.search, siteOrigin);

      // Prevent recursive proxy loop if target resolves to the current Studio Worker
      if (targetUrl.origin === url.origin) {
        return env.ASSETS.fetch(request);
      }

      const headers = new Headers(request.headers);
      headers.set('host', targetUrl.host);
      headers.set('x-forwarded-host', url.host);

      const init: RequestInit = {
        method: request.method,
        headers,
        redirect: 'follow',
      };

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        init.body = request.body;
        (init as any).duplex = 'half';
      }

      return fetch(targetUrl.toString(), init);
    }

    return env.ASSETS.fetch(request);
  },
};
