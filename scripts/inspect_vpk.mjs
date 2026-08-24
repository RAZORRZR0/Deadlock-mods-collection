import fs from 'node:fs';
import { parseVpk } from '../Show-rank-merger/src/vpkReader.js';

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node inspect_vpk.mjs <vpk-file>');
  process.exit(1);
}

const [vpkFile] = args;
if (!fs.existsSync(vpkFile)) {
  console.error(`VPK file not found: ${vpkFile}`);
  process.exit(1);
}

const bytes = fs.readFileSync(vpkFile);
const parsed = parseVpk(bytes);

for (const file of parsed.files) {
  console.log(file.path);
}
