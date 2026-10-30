import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const states = {
  default: { file: 'icon.png', gold: '#d9af68', light: '#ffe2a4', aura: '#b78337', line: '#8c6c3c', center: '#f6ce85' },
  active: { file: 'icon-active.png', gold: '#f2c778', light: '#fff2be', aura: '#d9a448', line: '#d0a457', center: '#fff0ad' },
  closed: { file: 'icon-closed.png', gold: '#ab8c5e', light: '#d8c095', aura: '#695337', line: '#745d3d', center: '#c5a773' },
  disabled: { file: 'icon-disabled.png', gold: '#77746f', light: '#b8b3aa', aura: '#484847', line: '#66635e', center: '#96918a' },
};

function icon({ gold, light, aura, line, center }, state) {
  const activeRays = state === 'active' ? `
    <g stroke="${light}" stroke-width="2" stroke-linecap="round" opacity=".9">
      <path d="M64 6v10M64 112v10M6 64h10M112 64h10M23 23l7 7M98 98l7 7M105 23l-7 7M30 98l-7 7"/>
    </g>` : '';
  const closedBar = state === 'closed' ? '<path d="M39 89h50" stroke="#d8c095" stroke-width="3" stroke-linecap="round" opacity=".8"/>' : '';
  const disabledSlash = state === 'disabled' ? '<path d="M28 99 99 28" stroke="#bbb6ad" stroke-width="5" stroke-linecap="round" opacity=".85"/>' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
    <defs>
      <linearGradient id="frame" x1="15" y1="11" x2="110" y2="118" gradientUnits="userSpaceOnUse"><stop stop-color="${light}"/><stop offset=".45" stop-color="${gold}"/><stop offset="1" stop-color="#704d25"/></linearGradient>
      <linearGradient id="plate" x1="23" y1="19" x2="105" y2="113" gradientUnits="userSpaceOnUse"><stop stop-color="#29231a"/><stop offset=".55" stop-color="#111315"/><stop offset="1" stop-color="#090a0b"/></linearGradient>
      <radialGradient id="glow"><stop stop-color="${aura}" stop-opacity=".33"/><stop offset="1" stop-color="${aura}" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="128" height="128" rx="29" fill="#090a0b"/>
    <rect x="5" y="5" width="118" height="118" rx="26" stroke="url(#frame)" stroke-width="2"/>
    <rect x="10" y="10" width="108" height="108" rx="22" fill="url(#plate)" stroke="${line}" stroke-width=".8"/>
    <circle cx="64" cy="64" r="52" fill="url(#glow)"/>
    ${activeRays}
    <path d="M64 23 94 40v48L64 105 34 88V40L64 23Z" stroke="url(#frame)" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M64 31 87 44v40L64 97 41 84V44L64 31Z" stroke="${line}" stroke-width="1" opacity=".75"/>
    <circle cx="64" cy="55" r="12" stroke="${light}" stroke-width="4"/>
    <circle cx="64" cy="55" r="4" fill="${center}"/>
    <path d="M64 68v20m0-10h10m-10 7h7" stroke="${light}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M53 55h-7m36 0h-7" stroke="${line}" stroke-width="1.5" stroke-linecap="round"/>
    ${closedBar}${disabledSlash}
  </svg>`;
}

await fs.mkdir(path.join(root, 'artwork'), { recursive: true });
for (const [state, palette] of Object.entries(states)) {
  const svg = icon(palette, state).replace(/^\s+$/gm, '');
  await fs.writeFile(path.join(root, 'artwork', `o11keys-${state}.svg`), svg);
  await sharp(Buffer.from(svg)).resize(128, 128).png().toFile(path.join(root, 'src', 'images', palette.file));
  await sharp(Buffer.from(svg)).resize(256, 256).png().toFile(path.join(root, 'artwork', `o11keys-${state}@2x.png`));
}
await fs.copyFile(path.join(root, 'artwork', 'o11keys-default.svg'), path.join(root, 'logo.svg'));
console.log('Generated four o11keys icon states at 128 px and 256 px.');
