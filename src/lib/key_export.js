function capturedAt(log) {
    const ms = Number(log.timestamp_ms) || Number(log.timestamp) * 1000;
    return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;
}

export function exportEntry(log) {
    return {
        page_url: log.url || null,
        title: log.title || null,
        origin: log.origin || null,
        captured_at: capturedAt(log),
        system: log.type || null,
        pssh: log.pssh || log.pssh_data || log.wrm_header || null,
        keys: (log.keys || []).map(({ kid, k }) => ({ kid, k })),
        manifests: (log.manifests || []).map(({ type, url, headers }) => ({
            type: type || (/\.m3u8(?:$|\?)/i.test(url || '') ? 'HLS' : 'DASH'),
            url,
            headers: headers || {}
        }))
    };
}

export function buildKeyExport(logs, browserUrl, exportedAt = new Date()) {
    return {
        format: 'o11keys-key-export',
        schema_version: 1,
        exported_at: exportedAt.toISOString(),
        browser_url: browserUrl || null,
        entries: logs.map(exportEntry)
    };
}

export function makeExportFilename(title, url) {
    const clean = value => String(value || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
        .replace(/\s+/g, ' ').replace(/[- ]+$/g, '').trim();
    let urlPart = '';
    try {
        const parsed = new URL(url);
        urlPart = clean(parsed.hostname + parsed.pathname.replace(/\/$/, ''));
    } catch {
        urlPart = clean(url);
    }
    return `${(clean(title) || 'o11keys').slice(0, 70)} - ${(urlPart || 'page').slice(0, 110)}.json`;
}
