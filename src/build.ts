import fs from 'fs';
import path from 'path';

// @ts-ignore
const archiver = require('archiver');

const filesToInclude = [
  'manifest.json',
  'background.js',
  'content.js',
  'sidepanel.html',
  'sidepanel.js',
  'sidepanel.css',
  'styles.css',
  'README.md',
  'PRIVACY.md',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png'
];

/**
 * Creates a compressed ZIP package containing the available extension files.
 */
export function createPackage(): void {
  const output = fs.createWriteStream('twitter-podcast-extension.zip');
  const archive = archiver('zip', {
    zlib: { level: 9 }
  });

  output.on('close', function() {
    console.log('✅ Package created: twitter-podcast-extension.zip');
    console.log(`📦 Total size: ${archive.pointer()} bytes`);
    console.log('🚀 Ready for Chrome Web Store submission!');
  });

  archive.on('error', function(err: any) {
    console.error('❌ Error creating package:', err);
    throw err;
  });

  archive.pipe(output);

  filesToInclude.forEach(file => {
    if (fs.existsSync(file)) {
      if (fs.statSync(file).isDirectory()) {
        archive.directory(file, file);
      } else {
        archive.file(file, { name: file });
      }
      console.log(`📁 Added: ${file}`);
    } else {
      console.warn(`⚠️  File not found: ${file}`);
    }
  });

  archive.finalize();
}

console.log('🔍 Checking required files...');
let missingFiles: string[] = [];

filesToInclude.forEach(file => {
  if (!fs.existsSync(file)) {
    missingFiles.push(file);
  }
});

if (missingFiles.length > 0) {
  console.error('❌ Missing required files:');
  missingFiles.forEach(file => console.error(`   - ${file}`));
  process.exit(1);
}

console.log('✅ All required files found');
console.log('📦 Creating Chrome Web Store package...');
createPackage();
