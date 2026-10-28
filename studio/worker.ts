interface Env {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Forward API requests to the production Astro SSR site
    if (url.pathname.startsWith('/api/')) {
      const targetUrl = new URL(url.pathname + url.search, 'https://gwenvenni.com');
      const headers = new Headers(request.headers);
      headers.set('host', 'gwenvenni.com');
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
