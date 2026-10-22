#!/usr/bin/env node
import('./node_modules/astro/dist/cli/index.js')
    .then(({ cli }) => cli(process.argv))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
