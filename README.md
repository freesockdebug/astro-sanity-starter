# GwenVenni — Official B2B Website & Sanity CMS

Built with **Astro SSR + Sanity CMS + Cloudflare Workers + Tailwind CSS v4 + DaisyUI + Nanostores**.

## Prerequisites

- **Node.js**: `>= 22.0.0`
- **Package Manager**: `npm`

## Development & Build Commands

```bash
# Install dependencies
npm install --legacy-peer-deps

# Start local development server (port 3000, includes /studio)
npm run dev

# Run pre-flight architecture & quality checks
npm run check

# Build production Astro SSR Worker
npm run build

# Build standalone Sanity Studio static bundle
npm run build:studio

# Deploy to Cloudflare Workers
npm run deploy
npm run deploy:studio
```
