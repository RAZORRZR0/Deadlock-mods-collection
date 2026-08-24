import fs from 'node:fs';
import path from 'node:path';
import { writeVpk } from '../Show-rank-merger/src/vpkWriter.js';
import { parseVpk } from '../Show-rank-merger/src/vpkReader.js';

function collectFiles(dir, baseDir = dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(collectFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      const bytes = fs.readFileSync(fullPath);
      results.push({ path: relPath, bytes });
    }
  }
  return results;
}

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node pack_vpk.mjs <input-dir> <output-vpk>');
  process.exit(1);
}

const [inputDir, outputVpk] = args;
if (!fs.existsSync(inputDir)) {
  console.error(`Input directory does not exist: ${inputDir}`);
  process.exit(1);
}

const files = collectFiles(inputDir);
console.log(`Packing ${files.length} files from ${inputDir} into ${outputVpk}...`);
const vpkBytes = writeVpk(files);
fs.writeFileSync(outputVpk, vpkBytes);
console.log(`Successfully wrote ${outputVpk} (${vpkBytes.byteLength} bytes).`);

// Verify read
const parsed = parseVpk(vpkBytes);
console.log(`Verified VPK archive contains ${parsed.files.length} files:`);
for (const file of parsed.files) {
  console.log(`  - ${file.path}`);
}
