const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const buildDir = path.resolve(__dirname, '../build');
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#0b1736" />
      <stop offset="70%" stop-color="#050811" />
      <stop offset="100%" stop-color="#020408" />
    </radialGradient>
    <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="25%" stop-color="#00f2fe" />
      <stop offset="65%" stop-color="#4facfe" />
      <stop offset="90%" stop-color="#7928ca" />
      <stop offset="100%" stop-color="#050811" />
    </radialGradient>
    <radialGradient id="outerHalo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#00f2fe" stop-opacity="0.35" />
      <stop offset="50%" stop-color="#9d4edd" stop-opacity="0.2" />
      <stop offset="100%" stop-color="#00f2fe" stop-opacity="0" />
    </radialGradient>
  </defs>

  <!-- Background circle -->
  <circle cx="128" cy="128" r="124" fill="url(#bg)" stroke="#00f2fe" stroke-width="3" stroke-opacity="0.7" />

  <!-- Outer halo glow -->
  <circle cx="128" cy="128" r="105" fill="url(#outerHalo)" />

  <!-- Outer Tech Ring with ticks -->
  <circle cx="128" cy="128" r="96" fill="none" stroke="#00f2fe" stroke-width="2.5" stroke-dasharray="10 8 4 8" opacity="0.85" />
  
  <!-- Counter-rotating Ring -->
  <circle cx="128" cy="128" r="82" fill="none" stroke="#9d4edd" stroke-width="2" stroke-dasharray="16 10 4 10" opacity="0.8" />

  <!-- Orbital nodes -->
  <circle cx="128" cy="32" r="5" fill="#00f2fe" />
  <circle cx="224" cy="128" r="5" fill="#00f2fe" />
  <circle cx="128" cy="224" r="5" fill="#00f2fe" />
  <circle cx="32" cy="128" r="5" fill="#00f2fe" />

  <!-- Core sphere -->
  <circle cx="128" cy="128" r="54" fill="url(#coreGlow)" />

  <!-- Crosshair tech lines -->
  <line x1="108" y1="128" x2="148" y2="128" stroke="#ffffff" stroke-width="2.5" opacity="0.9" />
  <line x1="128" y1="108" x2="128" y2="148" stroke="#ffffff" stroke-width="2.5" opacity="0.9" />

  <!-- Center reactor node -->
  <circle cx="128" cy="128" r="12" fill="#ffffff" />
</svg>`;

const svgPath = path.join(buildDir, 'icon.svg');
const pngPath = path.join(buildDir, 'icon.png');
const icoPath = path.join(buildDir, 'icon.ico');

fs.writeFileSync(svgPath, svgIcon, 'utf-8');

try {
  execSync(`convert -background none "${svgPath}" -resize 256x256 "${pngPath}"`, { stdio: 'inherit' });
  execSync(`convert "${pngPath}" -define icon:auto-resize=256,128,64,48,32,16 "${icoPath}"`, { stdio: 'inherit' });
  console.log('[Icon Generator] Created build/icon.png and build/icon.ico successfully.');
} catch (err) {
  console.warn('[Icon Generator] Warning converting with ImageMagick:', err.message);
}
