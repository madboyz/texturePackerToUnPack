const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: Drag and drop a .json or .atlas file onto this executable, or run:');
    console.log('  node split.js <file.json|file.atlas> [outDir]');
    console.log('  node split.js <atlas.png> <atlas.json> [outDir]');
    // Wait for input to close if running in double-click mode
    if (process.stdin.isTTY) {
       process.exit(1);
    } else {
        // Keep window open for a bit if executed via GUI
        console.log("Press any key to exit...");
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', process.exit.bind(process, 1));
        return;
    }
  }

  let pngPath, jsonPath, outDir;

  // Strategy 1: Explicit 2 or 3 arguments (old style)
  // Check if first arg is png and second is json (by extension)
  if (args.length >= 2 && args[0].toLowerCase().endsWith('.png') && (args[1].toLowerCase().endsWith('.json') || args[1].toLowerCase().endsWith('.atlas'))) {
      pngPath = args[0];
      jsonPath = args[1];
      outDir = args[2];
  } 
  // Strategy 2: Single argument (drag & drop) or first arg is json/atlas
  else {
      const inputPath = args[0];
      const ext = path.extname(inputPath).toLowerCase();
      const dir = path.dirname(inputPath);
      const name = path.basename(inputPath, ext);

      if (ext === '.json' || ext === '.atlas') {
          jsonPath = inputPath;
          // Try to find png with same name
          pngPath = path.join(dir, name + '.png');
          if (!fs.existsSync(pngPath)) {
              // Try .jpg?
              if (fs.existsSync(path.join(dir, name + '.jpg'))) {
                  pngPath = path.join(dir, name + '.jpg');
              }
          }
      } else if (ext === '.png' || ext === '.jpg') {
          pngPath = inputPath;
          // Try to find json/atlas
          if (fs.existsSync(path.join(dir, name + '.json'))) {
              jsonPath = path.join(dir, name + '.json');
          } else if (fs.existsSync(path.join(dir, name + '.atlas'))) {
              jsonPath = path.join(dir, name + '.atlas');
          }
      }

      // Determine output directory if not provided
      if (!outDir) {
          if (args[1]) {
              outDir = args[1];
          } else {
              // Use basename as output folder name in the same directory
              outDir = path.join(dir, name);
          }
      }
  }

  if (!pngPath || !jsonPath || !fs.existsSync(pngPath) || !fs.existsSync(jsonPath)) {
      console.error('Error: Could not locate both image and data files.');
      console.error(`  Image: ${pngPath || 'Not found'}`);
      console.error(`  Data:  ${jsonPath || 'Not found'}`);
      
      if (!process.stdin.isTTY) {
        console.log("Press any key to exit...");
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', process.exit.bind(process, 1));
        return;
      }
      process.exit(1);
  }

  console.log(`Processing:`);
  console.log(`  Image: ${pngPath}`);
  console.log(`  Data:  ${jsonPath}`);
  console.log(`  Output: ${outDir}`);

  await fs.promises.mkdir(outDir, { recursive: true });

  const sheet = sharp(pngPath);
  const jsonContent = await fs.promises.readFile(jsonPath, 'utf8');
  let json;
  try {
      json = JSON.parse(jsonContent);
  } catch (e) {
      console.error("Failed to parse JSON:", e);
      process.exit(1);
  }

  // Normalize frames list: TexturePacker may use object map or array
  let frames = [];
  if (Array.isArray(json.frames)) {
    frames = json.frames;
  } else if (json.frames && typeof json.frames === 'object') {
    frames = Object.entries(json.frames).map(([name, data]) => ({ filename: name, ...data }));
  } else {
    // Some formats might have frames directly as keys if not inside "frames" property,
    // but standard TexturePacker JSON (Hash/Array) usually has a "frames" key.
    // Let's check if the root object looks like a map of frames if "frames" is missing.
    // However, the provided code assumes json.frames.
    console.error('Unsupported JSON format: no frames property found');
    console.log('JSON structure keys:', Object.keys(json));
    process.exit(1);
  }

  for (const f of frames) {
    // Common field names
    const name = f.filename || f.name || f.file || 'unnamed';
    const frame = f.frame || f.rect || f.sourceRect;
    const rotated = !!(f.rotated);
    const trimmed = !!(f.trimmed);
    const spriteSourceSize = f.spriteSourceSize || f.spriteSourceRect || { x: 0, y: 0, w: (frame && frame.w) || 0, h: (frame && frame.h) || 0 };
    const sourceSize = f.sourceSize || f.originalSize || { w: (frame && frame.w) || 0, h: (frame && frame.h) || 0 };

    if (!frame || typeof frame.x !== 'number') {
      console.warn(`Skip ${name}: invalid frame`);
      continue;
    }

    // Extract region from atlas
    let region = sheet.clone().extract({
      left: frame.x,
      top: frame.y,
      width: frame.w,
      height: frame.h
    });

    // TexturePacker rotated = true means stored CW 90; rotate CCW 90 to restore
    if (rotated) {
      region = region.rotate(270); // CCW 90
    }

    let output;
    if (trimmed && sourceSize && spriteSourceSize) {
      // Rebuild original canvas with transparent padding
      const canvas = sharp({
        create: {
          width: sourceSize.w,
          height: sourceSize.h,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      });
      // sharp composite inputs need to be buffers or file paths
      const buf = await region.png().toBuffer();
      output = canvas.composite([{ input: buf, left: spriteSourceSize.x, top: spriteSourceSize.y }]);
    } else {
      output = region;
    }

    let safeName = sanitize(name);
    // If name already ends with .png, strip it before adding it back
    // This prevents .png.png double extension
    if (path.extname(safeName).toLowerCase() === '.png') {
        safeName = safeName.slice(0, -4);
    }
    const outPath = path.join(outDir, safeName + '.png');
    // Ensure subdirectory exists if name contains slashes
    await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
    
    await output.png().toFile(outPath);
    console.log('Saved:', outPath);
  }

  console.log('Done. Total:', frames.length);
}

function sanitize(s) {
  // Remove illegal filename characters for Windows, but keep path separators if they are intended subdirectories?
  // Usually texture packer names might contain slashes for folders.
  // The user provided sanitize function replaces slashes with underscores.
  // "return String(s).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();"
  // If we want to preserve folders, we should handle that. 
  // However, strict adherence to user provided code suggests replacing them.
  // But often users want folders. Let's stick to the user provided code logic for now to be safe, 
  // or maybe improve it slightly to just replace invalid chars but let's stick to the provided snippet for reliability unless it fails.
  // actually, looking at the user snippet: `replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')` 
  // This WILL replace / and \ with _. So it flattens the directory structure.
  return String(s).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
