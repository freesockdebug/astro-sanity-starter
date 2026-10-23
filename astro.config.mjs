import 'dotenv/config';
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sanity from '@sanity/astro';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';
import { sanityConfig } from './src/utils/sanity-client';

const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('build');

// https://astro.build/config
export default defineConfig({
    output: 'server',
    session: false,
    devToolbar: {
        enabled: false
    },
    adapter: cloudflare({
        imageService: 'passthrough'
    }),
    i18n: {
        defaultLocale: 'en',
        locales: ['en', 'de', 'fr', 'es'],
        routing: {
            prefixDefaultLocale: false
        }
    },
    image: {
        domains: ['cdn.sanity.io']
    },
    integrations: [
        ...(isProduction ? [] : [react()]),
        sanity({
            ...sanityConfig,
            ...(isProduction ? {} : { studioBasePath: '/studio' })
        })
    ],
    vite: {
        plugins: [
            tailwindcss(),
            {
                name: 'studio-trailing-slash',
                enforce: 'post',
                configureServer(server) {
                    server.middlewares.use((req, res, next) => {
                        if (req.url === '/studio' || req.url?.startsWith('/studio?')) {
                            req.url = req.url.replace('/studio', '/studio/');
                        }
                        if (req.url && req.url.includes('.css')) {
                            res.setHeader('Vary', 'Accept, Origin');
                            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
                        }
                        next();
                    });
                },
                hotUpdate({ file, modules, server }) {
                    if (file.endsWith('.css')) {
                        if (!this.environment || this.environment.name === 'client') {
                            server.ws.send({ type: 'full-reload', path: '*' });
                        }
                        return [];
                    }
                    return modules.filter(
                        (m) => !m.id?.endsWith('.css') && !m.url?.includes('.css')
                    );
                },
                handleHotUpdate({ file, modules, server }) {
                    if (file.endsWith('.css')) {
                        server.ws.send({ type: 'full-reload', path: '*' });
                        return [];
                    }
                    return modules.filter(
                        (m) => !m.id?.endsWith('.css') && !m.url?.includes('.css')
                    );
                }
            }
        ],
        define: !isProduction
            ? {
                  'process.env.SANITY_STUDIO_PROJECT_ID': JSON.stringify(
                      process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID || 'xvhhd8u0'
                  ),
                  'process.env.SANITY_STUDIO_DATASET': JSON.stringify(
                      process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production'
                  ),
                  'process.env.SANITY_PROJECT_ID': JSON.stringify(process.env.SANITY_PROJECT_ID || 'xvhhd8u0'),
                  'process.env.SANITY_DATASET': JSON.stringify(process.env.SANITY_DATASET || 'production'),
                  'process.env.SANITY_STUDIO_SITE_URL': JSON.stringify(process.env.SANITY_STUDIO_SITE_URL || ''),
                  'process.env.SANITY_STUDIO_REVALIDATE_SECRET': JSON.stringify(
                      process.env.SANITY_STUDIO_REVALIDATE_SECRET || process.env.REVALIDATE_SECRET || 'itsasecret'
                  )
              }
            : undefined,
        server: {
            hmr: { path: '/vite-hmr/' },
            allowedHosts: true
        },
        esbuild: {
            drop: isProduction ? ['console', 'debugger'] : []
        },
        optimizeDeps: {
            exclude: isProduction
                ? ['marked', '@sanity/client', 'ua-parser-js', '@nanostores/persistent']
                : ['marked', 'ua-parser-js', '@nanostores/persistent']
        }
    },
    server: {
        host: '0.0.0.0',
        port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000
    }
});
