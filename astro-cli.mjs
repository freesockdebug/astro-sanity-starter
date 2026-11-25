#!/usr/bin/env node
// Deduplicate repeated --port / --host flags when runner appends `--port 3000 --host 0.0.0.0`
const rawArgs = process.argv.slice(2);
const cleanArgs = [];
let seenPort = false;
let seenHost = false;

for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--port' || arg === '-p') {
        const nextVal = rawArgs[i + 1];
        if (!seenPort) {
            seenPort = true;
            cleanArgs.push(arg);
            if (nextVal !== undefined && !nextVal.startsWith('-')) {
                cleanArgs.push(nextVal);
                i++;
            }
        } else if (nextVal !== undefined && !nextVal.startsWith('-')) {
            i++;
        }
        continue;
    }
    if (arg === '--host') {
        const nextVal = rawArgs[i + 1];
        if (!seenHost) {
            seenHost = true;
            cleanArgs.push(arg);
            if (nextVal !== undefined && !nextVal.startsWith('-')) {
                cleanArgs.push(nextVal);
                i++;
            }
        } else if (nextVal !== undefined && !nextVal.startsWith('-')) {
            i++;
        }
        continue;
    }
    cleanArgs.push(arg);
}

const finalArgv = [process.argv[0], process.argv[1], ...cleanArgs];

import('./node_modules/astro/dist/cli/index.js')
    .then(({ cli }) => cli(finalArgv))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

