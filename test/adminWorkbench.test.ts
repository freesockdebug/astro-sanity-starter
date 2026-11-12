// test/adminWorkbench.test.ts
// Unit tests for adminWorkbench pure utilities using Node 22 native test runner
import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, exportToCsv, readJsonStore } from '../src/utils/adminWorkbench.js';

test('escapeHtml escapes dangerous HTML characters to prevent XSS', () => {
  assert.equal(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  assert.equal(escapeHtml('Hello & "World" \'123\''), 'Hello &amp; &quot;World&quot; &#39;123&#39;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(12345), '12345');
});

test('exportToCsv properly formats CSV cells and handles comma, quotes and linebreaks', () => {
  let createdBlob: any = null;
  // Mock global Blob and URL for headless node environment
  (globalThis as any).Blob = class MockBlob {
    content: any[];
    options: any;
    constructor(content: any[], options: any) {
      this.content = content;
      this.options = options;
      createdBlob = this;
    }
  };
  (globalThis as any).URL = {
    createObjectURL: () => 'blob:mock-url',
    revokeObjectURL: () => {},
  };
  (globalThis as any).document = {
    createElement: () => ({
      setAttribute: () => {},
      style: {},
      click: () => {},
    }),
    body: {
      appendChild: () => {},
      removeChild: () => {},
    },
  };

  exportToCsv('test.csv', ['Name', 'Details', 'Price'], [
    ['Standard Item', 'Normal description', 100],
    ['Complex, Item', 'Quotes "Included" and\nNewline', 250],
  ]);

  assert.ok(createdBlob, 'Blob should be created');
  const csvContent = createdBlob.content[0];
  assert.match(csvContent, /Name,Details,Price/);
  assert.match(csvContent, /"Complex, Item"/);
  assert.match(csvContent, /"Quotes ""Included"" and\nNewline"/);
});

test('readJsonStore safely reads JSON from DOM element or returns fallback', () => {
  // Mock document.getElementById
  const store: Record<string, string> = {
    'valid-json': JSON.stringify({ ok: true, count: 42 }),
    'invalid-json': '{ bad json',
  };

  (globalThis as any).document = {
    getElementById: (id: string) => {
      if (id in store) {
        return { textContent: store[id] };
      }
      return null;
    },
  };

  assert.deepEqual(readJsonStore('valid-json', {}), { ok: true, count: 42 });
  assert.deepEqual(readJsonStore('invalid-json', { fallback: true }), { fallback: true });
  assert.deepEqual(readJsonStore('non-existent', ['default']), ['default']);
});
