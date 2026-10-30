function quoted(value) {
    return `"${String(value ?? '').replace(/"/g, "'")}"`;
}

export function buildCommand(metadata, keyString, title, options) {
    const headers = Object.entries(metadata.headers || {}).map(([key, value]) =>
        `-H ${quoted(`${key}: ${value}`)}`
    );
    const stream = [];
    if (options.videoStream === 'best') stream.push('-sv best');
    if (['1080', '720', '480'].includes(options.videoStream)) {
        stream.push(`-sv res="${options.videoStream}*"`);
    }
    if (options.audioAll) stream.push('-sa all');
    if (options.subsAll) stream.push('-ss all');
    return [
        options.executable || 'N_m3u8DL-RE',
        quoted(metadata.url),
        ...headers,
        keyString,
        options.decryptionEngine ? `--decryption-engine ${options.decryptionEngine}` : '',
        `-M format=${options.format}:muxer=${options.muxer}`,
        ...stream,
        options.extraArgs?.trim(),
        title ? `--save-name ${quoted(title)}` : ''
    ].filter(Boolean).join(' ');
}
