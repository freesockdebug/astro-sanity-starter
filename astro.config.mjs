import 'dotenv/config';
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sanity from '@sanity/astro';
import cloudflare from '@astrojs/cloudflare';
import { sanityConfig } from './src/utils/sanity-client';

// https://astro.build/config
export default defineConfig({
    output: 'server',
    adapter: cloudflare({
        imageService: 'passthrough'
    }),
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
        optimizeDeps: {
            exclude: ['marked']
        }
    },
    server: {
        host: '0.0.0.0',
        port: 4321
    }
});
