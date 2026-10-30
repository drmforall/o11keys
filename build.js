import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { execSync } from 'child_process';

function compileProtobuf() {
    const protoPath = path.join(import.meta.dirname, 'license_protocol.proto');
    const outDir = path.join(import.meta.dirname, 'src', 'lib', 'widevine');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const outFile = path.join(outDir, 'license_protocol.js');
    const cmd = `npx pbjs --dependency ./protobuf.min.js -t static-module -w es6 -o "${outFile}" "${protoPath}"`;
    execSync(cmd, { stdio: 'inherit' });
    const generated = fs.readFileSync(outFile, 'utf8');
    fs.writeFileSync(outFile, generated.replace(
        'import $protobuf from "./protobuf.min.js";',
        'import * as $protobuf from "./protobuf.min.js";'
    ));
    console.log(`Generated JS from ${protoPath} to ${outFile}`);
}

// Read version from package.json
function getVersion() {
    const pkg = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'package.json'), 'utf8'));
    return pkg.version;
}

function zipSrc(version, browser = 'chrome') {
    const outputDir = path.join(import.meta.dirname, 'dist');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const zipPath = path.join(outputDir, `o11keys-${version}${browser === 'firefox' ? '-firefox' : ''}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
        console.log(`Created ${zipPath} (${archive.pointer()} bytes)`);
    });

    archive.on('error', err => { throw err; });

    archive.pipe(output);
    const sourceDir = path.join(import.meta.dirname, 'src');
    if (browser === 'firefox') {
        const manifest = JSON.parse(fs.readFileSync(path.join(sourceDir, 'manifest.json'), 'utf8'));
        delete manifest.version_name;
        manifest.background = { scripts: ['background.js'], type: 'module' };
        manifest.browser_specific_settings.gecko.strict_min_version = '121.0';
        archive.glob('**/*', { cwd: sourceDir, ignore: ['manifest.json'] });
        archive.append(JSON.stringify(manifest, null, 2) + '\n', { name: 'manifest.json' });
    } else {
        archive.directory(sourceDir, false);
    }
    archive.file(path.join(import.meta.dirname, 'LICENSE'), { name: 'LICENSE' });
    archive.file(path.join(import.meta.dirname, 'NOTICE'), { name: 'NOTICE' });
    archive.finalize();
}

// Main build process
function build() {
    compileProtobuf();
    const version = getVersion();
    zipSrc(version, 'chrome');
    zipSrc(version, 'firefox');
}

build();
