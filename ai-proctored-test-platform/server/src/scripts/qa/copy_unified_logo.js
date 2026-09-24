const fs = require('fs');
const path = require('path');

const srcLogo = 'C:\\Users\\GLB-BLR-112\\.gemini\\antigravity-ide\\brain\\218a7624-67c0-4cf9-bf77-bc409535b4c9\\.user_uploaded\\media_1790251631351.png';

const destinations = [
  path.resolve(__dirname, '../../../../client/src/assets/logo-light.png'),
  path.resolve(__dirname, '../../../../client/src/assets/logo-dark.png'),
  path.resolve(__dirname, '../../../../client/src/assets/globussoft-logo.png'),
  path.resolve(__dirname, '../../../../client/public/logo-light.png'),
  path.resolve(__dirname, '../../../../client/public/logo-dark.png'),
  path.resolve(__dirname, '../../../../client/public/globussoft-logo.png'),
  path.resolve(__dirname, '../../assets/logo-light.png'),
  path.resolve(__dirname, '../../assets/logo-dark.png'),
  path.resolve(__dirname, '../../assets/globussoft-logo.png')
];

for (const dest of destinations) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(srcLogo, dest);
  console.log(`Copied logo to ${dest} (${fs.statSync(dest).size} bytes)`);
}

console.log('All logo assets successfully updated with the requested white/cyan logo!');
