import 'dotenv/config';
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sanity from '@sanity/astro';
import cloudflare from '@astrojs/cloudflare';
import { sanityConfig } from './src/utils/sanity-client';

const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('build');

// https://astro.build/config
export default defineConfig({
    output: 'server',
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
    integrations: [sanity(sanityConfig)],
    vite: {
        plugins: [tailwindcss()],
        server: {
            hmr: { path: '/vite-hmr/' },
            allowedHosts: true
        },
        esbuild: {
            drop: isProduction ? ['console', 'debugger'] : []
        },
        optimizeDeps: {
            exclude: ['marked', '@sanity/client', 'ua-parser-js', '@nanostores/persistent']
        }
    },
    server: {
        host: '0.0.0.0',
        port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000
    }
});
