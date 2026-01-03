#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// Files to include in the Chrome Web Store package
const filesToInclude = [
    'manifest.json',
    'content.js',
    'popup.html',
    'popup.js',
    'popup.css',
    'styles.css',
    'README.md',
    'PRIVACY.md',
    'icons/icon16.png',
    'icons/icon48.png',
    'icons/icon128.png'
];

// Files to exclude from package
const filesToExclude = [
    'build.js',
    'CHROME_STORE_SUBMISSION.md',
    '.kiro/',
    'node_modules/',
    '.git/',
    '.gitignore',
    'package.json',
    'package-lock.json'
];

function createPackage() {
    const output = fs.createWriteStream('twitter-podcast-extension.zip');
    const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
    });

    output.on('close', function() {
        console.log('✅ Package created: twitter-podcast-extension.zip');
        console.log(`📦 Total size: ${archive.pointer()} bytes`);
        console.log('🚀 Ready for Chrome Web Store submission!');
    });

    archive.on('error', function(err) {
        console.error('❌ Error creating package:', err);
        throw err;
    });

    archive.pipe(output);

    // Add files to archive
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

// Check if required files exist
console.log('🔍 Checking required files...');
let missingFiles = [];

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