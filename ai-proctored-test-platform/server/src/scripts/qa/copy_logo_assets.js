const fs = require('fs');
const path = require('path');

const srcLight = 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\218a7624-67c0-4cf9-bf77-bc409535b4c9\\.user_uploaded\\media_1790250530584.png';
const srcDark = 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\218a7624-67c0-4cf9-bf77-bc409535b4c9\\.user_uploaded\\media_1790250535774.png';

const destinations = [
  { src: srcLight, dest: path.resolve(__dirname, '../../../../client/src/assets/logo-light.png') },
  { src: srcDark, dest: path.resolve(__dirname, '../../../../client/src/assets/logo-dark.png') },
  { src: srcLight, dest: path.resolve(__dirname, '../../../../client/src/assets/globussoft-logo.png') },
  { src: srcLight, dest: path.resolve(__dirname, '../../../../client/public/logo-light.png') },
  { src: srcDark, dest: path.resolve(__dirname, '../../../../client/public/logo-dark.png') },
  { src: srcLight, dest: path.resolve(__dirname, '../../../../client/public/globussoft-logo.png') },
  { src: srcLight, dest: path.resolve(__dirname, '../../assets/logo-light.png') },
  { src: srcDark, dest: path.resolve(__dirname, '../../assets/logo-dark.png') },
  { src: srcLight, dest: path.resolve(__dirname, '../../assets/globussoft-logo.png') },
];

for (const { src, dest } of destinations) {
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
  console.log(`Copied ${path.basename(src)} -> ${dest}`);
}
