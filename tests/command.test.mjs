import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommand } from '../src/pages/panel/command.js';

const metadata = { url: 'https://example.test/video.mpd', headers: { Referer: 'https://example.test/' } };
const defaults = { executable: 'N_m3u8DL-RE', format: 'mp4', muxer: 'ffmpeg', videoStream: 'none', decryptionEngine: '', audioAll: false, subsAll: false, extraArgs: '' };

test('default command leaves stream and engine selection to the downloader', () => {
    const command = buildCommand(metadata, '--key aa:bb', '', defaults);
    assert.match(command, /^N_m3u8DL-RE "https:\/\/example\.test\/video\.mpd"/);
    assert.doesNotMatch(command, /-sv|-sa|-ss|--decryption-engine/);
});

test('selected quality and custom options appear in the command', () => {
    const command = buildCommand(metadata, '--key aa:bb', 'A title', {
        ...defaults, videoStream: '720', extraArgs: '--check-segments-count false'
    });
    assert.match(command, /-sv res="720\*"/);
    assert.match(command, /--check-segments-count false/);
    assert.match(command, /--save-name "A title"$/);
});

test('manual manifest without headers can generate a command', () => {
    const command = buildCommand({ url: 'https://example.test/live.m3u8' }, '--key aa:bb', '', defaults);
    assert.match(command, /live\.m3u8/);
    assert.doesNotMatch(command, /-H/);
});
