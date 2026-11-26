// Generates every photo size and format the site serves, from one master image.
//
//   npm run images
//
// Run it after replacing public/assets/img/jayant-goswami.jpg (the 720×720 master) or
// assets-src/og-image-source.png, then commit the outputs. The site build (build.sh) does not
// run this, so deploys never depend on Node or image libraries.
//
// Outputs (all in public/assets/img/):
//   jayant-goswami-{360,720}.{avif,webp}  About-page photo, modern formats (JPEG fallbacks: the master
//                                          and jayant-goswami-360.jpg)
//   jayant-goswami-360.jpg                 360 px JPEG fallback
//   jayant-goswami-avatar.{avif,webp,jpg}  160 px avatar: header logo and small mobile photo
//   og-image.jpg                           1200×630 link-preview image (LinkedIn, WhatsApp, etc.)
//   campaigncrafter-poster.webp            1280×720 poster frame for the demo video
import sharp from "sharp";
import { statSync, existsSync } from "node:fs";

const DIR = "public/assets/img";
const MASTER = `${DIR}/jayant-goswami.jpg`;
const OG_SOURCE = "assets-src/og-image-source.png";

const kb = (f) => `${(statSync(f).size / 1024).toFixed(1)} KB`;
const done = (f) => console.log(`  ${f.replace(`${DIR}/`, "").padEnd(32)} ${kb(f)}`);

async function variants(width, base, { jpg = false } = {}) {
  const img = () => sharp(MASTER).resize(width, width, { fit: "cover" });
  await img().avif({ quality: 55, effort: 9 }).toFile(`${base}.avif`); done(`${base}.avif`);
  await img().webp({ quality: 78, effort: 6 }).toFile(`${base}.webp`); done(`${base}.webp`);
  if (jpg) { await img().jpeg({ quality: 80, mozjpeg: true }).toFile(`${base}.jpg`); done(`${base}.jpg`); }
}

console.log(`Master: ${MASTER} (${kb(MASTER)})`);
await variants(720, `${DIR}/jayant-goswami-720`);
await variants(360, `${DIR}/jayant-goswami-360`, { jpg: true });
await variants(160, `${DIR}/jayant-goswami-avatar`, { jpg: true });

if (existsSync(OG_SOURCE)) {
  await sharp(OG_SOURCE).resize(1200, 630, { fit: "cover" }).jpeg({ quality: 84, mozjpeg: true })
    .toFile(`${DIR}/og-image.jpg`);
  done(`${DIR}/og-image.jpg`);
}

// Demo video poster: shown before the video loads (the video itself then only downloads on play).
const POSTER_SOURCE = "assets-src/demo-poster-source.png";
if (existsSync(POSTER_SOURCE)) {
  await sharp(POSTER_SOURCE).resize(1280, 720, { fit: "cover" }).webp({ quality: 72, effort: 6 })
    .toFile(`${DIR}/campaigncrafter-poster.webp`);
  done(`${DIR}/campaigncrafter-poster.webp`);
}
