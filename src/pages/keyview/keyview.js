import { buildKeyExport, makeExportFilename } from '../../lib/key_export.js';

function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function addText(parent, tag, value, className = '') {
    const element = document.createElement(tag);
    element.textContent = value;
    if (className) element.className = className;
    parent.appendChild(element);
    return element;
}

function safeLink(element, value) {
    try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported URL');
        element.href = url.href;
    } catch {
        element.removeAttribute('href');
    }
    element.textContent = value || 'Unavailable';
}

async function loadSelection(token) {
    const key = `keyview:${token}`;
    const result = await new Promise((resolve, reject) => {
        chrome.storage.session.get(key, values => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(values[key]);
        });
    });
    if (result) chrome.storage.session.remove(key);
    return result;
}

async function main() {
    const token = new URL(location.href).searchParams.get('id');
    if (!token) throw new Error('No key entry was selected.');
    const selection = await loadSelection(token);
    if (!selection?.log) throw new Error('This key viewer link has expired. Open the entry from the control panel again.');
    const { log, browserUrl } = selection;
    const pageUrl = log.url || browserUrl || '';
    document.getElementById('title').textContent = log.title || 'Captured keys';
    safeLink(document.getElementById('browserUrl'), browserUrl || pageUrl);
    if (pageUrl && pageUrl !== browserUrl) {
        const captured = document.getElementById('capturedPage');
        captured.hidden = false;
        captured.textContent = `Captured page: ${pageUrl}`;
    }

    const keyBox = document.getElementById('keys');
    const pairs = (log.keys || []).map(item => `${item.kid}:${item.k}`);
    if (!pairs.length) addText(keyBox, 'p', 'No keys are stored for this entry.', 'empty');
    for (const [index, key] of (log.keys || []).entries()) {
        const row = addText(keyBox, 'div', '', 'key-row');
        addText(row, 'code', `KID  ${key.kid}`);
        addText(row, 'code', `KEY  ${key.k}`);
        const copy = addText(row, 'button', 'Copy key');
        copy.type = 'button';
        copy.addEventListener('click', () => navigator.clipboard.writeText(pairs[index]));
    }
    document.getElementById('copyAll').addEventListener('click', () => navigator.clipboard.writeText(pairs.join('\n')));

    const manifestBox = document.getElementById('manifests');
    const manifests = log.manifests || [];
    if (!manifests.length) addText(manifestBox, 'p', 'No MPD or HLS manifest was captured. Add one from the control panel.', 'empty');
    for (const manifest of manifests) {
        const row = addText(manifestBox, 'div', '', 'manifest-row');
        addText(row, 'small', manifest.type || 'MANIFEST');
        const link = document.createElement('a');
        safeLink(link, manifest.url);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        row.appendChild(link);
        const copy = addText(row, 'button', 'Copy URL');
        copy.type = 'button';
        copy.addEventListener('click', () => navigator.clipboard.writeText(manifest.url));
    }
    document.getElementById('exportJson').addEventListener('click', () => {
        downloadJson(buildKeyExport([log], browserUrl), makeExportFilename(log.title, pageUrl));
    });
    document.getElementById('content').hidden = false;
}

main().catch(error => {
    const message = document.getElementById('error');
    message.textContent = error.message || String(error);
    message.hidden = false;
});
