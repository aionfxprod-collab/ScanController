// Generates assets/demo-panel.svg: an ORIGINAL fictional manga page (dark seinen, black & white)
// used as the public demo plate in showcase.html. Original artwork made for this project, free to use (CC0).
// Scene: a hooded wanderer with a lantern in night rain. Usage: node tools/gen-demo-panel.js
const fs = require('fs');
const path = require('path');

let seed = 1337;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const W = 860, H = 1234;
const f = (n) => n.toFixed(1);
const out = [];

out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
out.push('<title>ScanController demo page: original artwork, free to use (CC0)</title>');
out.push(`<defs>
  <pattern id="dots" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="3.5" cy="3.5" r="1.25" fill="#000"/></pattern>
  <pattern id="dotsFine" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="2.5" cy="2.5" r="0.8" fill="#000"/></pattern>
  <radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff"/><stop offset="0.55" stop-color="#fff" stop-opacity="0.85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <clipPath id="cA"><rect x="30" y="30" width="490" height="370"/></clipPath>
  <clipPath id="cB"><rect x="540" y="30" width="290" height="370"/></clipPath>
  <clipPath id="cC"><rect x="30" y="420" width="800" height="784"/></clipPath>
</defs>`);
out.push(`<rect width="${W}" height="${H}" fill="#fff"/>`);

/* ---------- Panel A: rooftops, crescent moon, rain ---------- */
out.push('<g clip-path="url(#cA)">');
out.push('<rect x="30" y="30" width="490" height="370" fill="#111"/>');
out.push('<rect x="30" y="30" width="490" height="370" fill="url(#dots)" opacity="0.35"/>');
out.push('<circle cx="395" cy="120" r="56" fill="#fff"/><circle cx="420" cy="104" r="52" fill="#111"/>');
let x = 30, sky = 'M30 400';
while (x < 520) {
  const w = 30 + rnd() * 55, h = 120 + rnd() * 150;
  sky += ` L${f(x)} ${f(400 - h)} L${f(x + w)} ${f(400 - h)}`;
  x += w;
}
sky += ' L520 400 Z';
out.push(`<path d="${sky}" fill="#000"/>`);
for (let i = 0; i < 26; i++) {
  out.push(`<rect x="${f(45 + rnd() * 460)}" y="${f(200 + rnd() * 170)}" width="7" height="10" fill="#fff" opacity="${f(0.5 + rnd() * 0.5)}"/>`);
}
for (let i = 0; i < 90; i++) {
  const rx = 30 + rnd() * 520, ry = 20 + rnd() * 380, l = 18 + rnd() * 30;
  out.push(`<path d="M${f(rx)} ${f(ry)} l${f(-l * 0.28)} ${f(l)}" stroke="#fff" stroke-width="1.3" opacity="${f(0.35 + rnd() * 0.5)}"/>`);
}
out.push('</g>');
out.push('<rect x="52" y="52" width="210" height="64" fill="#fff" stroke="#000" stroke-width="3"/>');
out.push('<text x="157" y="80" text-anchor="middle" font-family="Georgia, serif" font-size="17" font-style="italic">The rain has not</text>');
out.push('<text x="157" y="103" text-anchor="middle" font-family="Georgia, serif" font-size="17" font-style="italic">stopped in days.</text>');

/* ---------- Panel B: close-up of an eye, scar, hatching ---------- */
out.push('<g clip-path="url(#cB)">');
out.push('<rect x="540" y="30" width="290" height="370" fill="#fff"/>');
out.push('<rect x="540" y="30" width="290" height="370" fill="url(#dotsFine)" opacity="0.55"/>');
for (let i = 0; i < 40; i++) {
  const y0 = 40 + i * 9;
  out.push(`<path d="M540 ${f(y0)} L830 ${f(y0 - 40)}" stroke="#000" stroke-width="${f(0.6 + (i % 3) * 0.3)}" opacity="0.25"/>`);
}
out.push('<path d="M565 150 Q680 98 810 140 L812 158 Q690 120 568 168 Z" fill="#000"/>');
out.push('<path d="M640 92 L728 236" stroke="#000" stroke-width="5" stroke-linecap="round"/>');
out.push('<path d="M652 120 l14 -6 M668 146 l14 -6 M684 172 l14 -6 M700 198 l14 -6" stroke="#000" stroke-width="3"/>');
out.push('<path d="M575 236 Q690 168 810 226 Q700 300 575 236 Z" fill="#fff" stroke="#000" stroke-width="6"/>');
out.push('<circle cx="690" cy="232" r="40" fill="#000"/><circle cx="690" cy="232" r="40" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="3 5"/>');
out.push('<circle cx="690" cy="232" r="15" fill="#000" stroke="#fff" stroke-width="1.5"/><circle cx="676" cy="218" r="8" fill="#fff"/><circle cx="702" cy="246" r="3.5" fill="#fff"/>');
out.push('<path d="M580 262 Q690 318 806 250" fill="none" stroke="#000" stroke-width="3"/>');
for (let i = 0; i < 9; i++) {
  out.push(`<path d="M${f(600 + i * 24)} ${f(276 + Math.sin(i) * 4)} l-4 ${f(12 + rnd() * 6)}" stroke="#000" stroke-width="2"/>`);
}
for (let i = 0; i < 6; i++) {
  const dx = 570 + rnd() * 240, dy = 300 + rnd() * 80;
  out.push(`<path d="M${f(dx)} ${f(dy)} q5 10 0 14 q-5 -4 0 -14z" fill="#fff" stroke="#000" stroke-width="1.6"/>`);
}
out.push('</g>');

/* ---------- Panel C: hooded wanderer with lantern, focus lines, rain ---------- */
const cx = 455, cy = 760;
out.push('<g clip-path="url(#cC)">');
out.push('<rect x="30" y="420" width="800" height="784" fill="#fff"/>');
for (let i = 0; i < 260; i++) {
  const a = rnd() * Math.PI * 2, r0 = 250 + rnd() * 120, r1 = 900, w = 0.8 + rnd() * 3.2;
  const ax = Math.cos(a), ay = Math.sin(a), px = -ay * w, py = ax * w;
  out.push(`<path d="M${f(cx + ax * r0)} ${f(cy + ay * r0)} L${f(cx + ax * r1 + px)} ${f(cy + ay * r1 + py)} L${f(cx + ax * r1 - px)} ${f(cy + ay * r1 - py)} Z" fill="#000"/>`);
}
out.push('<circle cx="652" cy="930" r="170" fill="url(#glow)"/>');
out.push('<path d="M30 1080 L830 1060 L830 1204 L30 1204 Z" fill="#000"/>');
out.push('<ellipse cx="470" cy="1130" rx="230" ry="26" fill="#fff" opacity="0.18"/>');
for (let i = 0; i < 18; i++) {
  out.push(`<ellipse cx="${f(260 + rnd() * 420)}" cy="${f(1100 + rnd() * 70)}" rx="${f(10 + rnd() * 26)}" ry="${f(2 + rnd() * 3)}" fill="none" stroke="#fff" stroke-width="1.4" opacity="0.6"/>`);
}
// the wanderer: long hooded coat
out.push(`<path d="M455 560 C410 560 382 600 382 650 C382 690 396 712 404 728
  C360 770 330 860 318 960 C308 1040 300 1080 296 1100 L372 1104 C380 1050 392 1000 410 960
  L414 1104 L498 1104 L500 960 C518 1000 528 1050 534 1104 L612 1100 C600 1000 580 880 540 800
  C528 778 516 760 506 746 C518 724 530 694 530 652 C530 600 500 560 455 560 Z" fill="#000"/>`);
out.push('<path d="M318 960 C280 1000 250 1030 214 1046 C260 1020 286 990 300 940 Z" fill="#000"/>');
out.push('<path d="M600 980 C640 1010 690 1030 730 1032 C690 1010 650 980 612 930 Z" fill="#000"/>');
// face mostly in shadow under the hood
out.push('<path d="M436 694 Q455 708 474 694 Q470 712 455 718 Q440 712 436 694 Z" fill="#fff" opacity="0.9"/>');
out.push('<path d="M448 706 l6 1" stroke="#000" stroke-width="2"/>');
out.push('<circle cx="468" cy="668" r="3.2" fill="#fff"/>');
out.push('<path d="M392 640 C396 596 420 572 455 570" fill="none" stroke="#fff" stroke-width="3" opacity="0.8"/>');
// arm and lantern
out.push('<path d="M512 770 C560 800 610 840 650 872" fill="none" stroke="#000" stroke-width="26" stroke-linecap="round"/>');out.push('<path d="M520 760 C566 790 612 826 652 858" fill="none" stroke="#fff" stroke-width="2.5" opacity="0.7"/>');
out.push('<path d="M652 880 L652 902" stroke="#000" stroke-width="3"/>');
out.push('<rect x="630" y="902" width="44" height="56" rx="6" fill="#fff" stroke="#000" stroke-width="5"/>');
out.push('<path d="M630 914 H674 M630 946 H674" stroke="#000" stroke-width="3"/><path d="M638 902 L644 892 H660 L666 902" fill="#000"/>');
out.push('<path d="M652 920 q8 12 0 22 q-8 -10 0 -22z" fill="#000"/>');
for (let i = 0; i < 14; i++) {
  out.push(`<path d="M${f(360 + i * 2)} ${f(800 + i * 20)} l${f(30 + rnd() * 20)} -8" stroke="#fff" stroke-width="1.2" opacity="0.45"/>`);
}
for (let i = 0; i < 220; i++) {
  const rx = 30 + rnd() * 820, ry = 400 + rnd() * 800, l = 24 + rnd() * 40;
  out.push(`<path d="M${f(rx)} ${f(ry)} l${f(-l * 0.22)} ${f(l)}" stroke="${rnd() < 0.5 ? '#000' : '#fff'}" stroke-width="1.4" opacity="${f(0.4 + rnd() * 0.5)}"/>`);
}
out.push('</g>');

// speech balloon + sound effect
out.push('<path d="M600 470 C600 450 620 440 690 440 C770 440 800 452 800 476 C800 504 770 516 700 516 L668 548 L672 516 C620 512 600 500 600 476 Z" fill="#fff" stroke="#000" stroke-width="3.5"/>');
out.push('<text x="700" y="486" text-anchor="middle" font-family="Comic Sans MS, Segoe Print, sans-serif" font-size="22" font-weight="700">...Still raining.</text>');
out.push('<g transform="translate(70 560) rotate(-8)"><text font-family="Impact, Arial Black, sans-serif" font-size="96" fill="#fff" stroke="#000" stroke-width="10" paint-order="stroke" letter-spacing="4">ZAAAA</text></g>');

// panel borders
out.push('<g fill="none" stroke="#000" stroke-width="6"><rect x="30" y="30" width="490" height="370"/><rect x="540" y="30" width="290" height="370"/><rect x="30" y="420" width="800" height="784"/></g>');
out.push('</svg>');

const dest = path.join(__dirname, '..', 'assets', 'demo-panel.svg');
fs.writeFileSync(dest, out.join('\n'));
console.log('wrote', dest, fs.statSync(dest).size, 'bytes');
