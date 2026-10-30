import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKeyExport, makeExportFilename } from '../src/lib/key_export.js';

const log = {
    url: 'https://video.example/watch/42',
    title: 'Episode 42',
    origin: 'https://video.example',
    timestamp_ms: Date.UTC(2026, 9, 30, 12, 0, 0),
    type: 'WIDEVINE',
    pssh: 'sample-pssh',
    keys: [{ kid: '0011', k: 'aabb' }],
    manifests: [{ type: 'DASH', url: 'https://cdn.example/stream.mpd', headers: { Referer: 'https://video.example/' } }]
};

test('export includes browser page, captured page, keys, and MPD', () => {
    const output = buildKeyExport([log], 'https://video.example/watch/42', new Date('2026-10-30T13:00:00Z'));
    assert.equal(output.schema_version, 1);
    assert.equal(output.browser_url, 'https://video.example/watch/42');
    assert.equal(output.entries[0].page_url, log.url);
    assert.deepEqual(output.entries[0].keys, [{ kid: '0011', k: 'aabb' }]);
    assert.equal(output.entries[0].manifests[0].url, 'https://cdn.example/stream.mpd');
    assert.equal(output.entries[0].captured_at, '2026-10-30T12:00:00.000Z');
    assert.equal(JSON.parse(JSON.stringify(output)).entries[0].title, 'Episode 42');
});

test('JSON filename starts with metadata title followed by a safe URL', () => {
    const filename = makeExportFilename('Episode: 42 / Finale', 'https://video.example/watch/42?token=private');
    assert.match(filename, /^Episode- 42 - Finale - video\.example-watch-42\.json$/);
    assert.doesNotMatch(filename, /private|[<>:"/\\|?*]/);
});

test('old logs without manifests still export as valid JSON', () => {
    const output = buildKeyExport([{ ...log, manifests: undefined, timestamp_ms: undefined, timestamp: 1 }], null);
    assert.deepEqual(output.entries[0].manifests, []);
    assert.equal(output.entries[0].captured_at, '1970-01-01T00:00:01.000Z');
});
