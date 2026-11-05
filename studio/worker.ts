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
      const siteOrigin = env.SITE_ORIGIN || 'https://gwenvenni.com';
      const targetUrl = new URL(url.pathname + url.search, siteOrigin);
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
