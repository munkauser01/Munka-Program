const {app, nativeImage} = require('electron');
const fs = require('node:fs'), path = require('node:path');
app.whenReady().then(() => {
  try {
    const output = process.argv[2];
    const original = nativeImage.createFromPath(path.join(output,'assets/munka.png'));
    if (original.isEmpty()) throw Error('Munka logo is unavailable.');
    const size = original.getSize();
    // Center the original aspect ratio on a square transparent icon canvas.
    for (const target of [192,512]) {
      const scale = target * 0.8 / Math.max(size.width,size.height);
      const width=Math.round(size.width*scale),height=Math.round(size.height*scale);
      const resized=original.resize({width,height,quality:'best'}).toBitmap();
      const bitmap=Buffer.alloc(target*target*4);
      const left=Math.floor((target-width)/2),top=Math.floor((target-height)/2);
      for(let y=0;y<height;y++)resized.copy(bitmap,((y+top)*target+left)*4,y*width*4,(y+1)*width*4);
      fs.writeFileSync(path.join(output,`assets/app-${target}.png`),nativeImage.createFromBitmap(bitmap,{width:target,height:target}).toPNG());
    }
    app.quit();
  } catch(error) { console.error(error.message);app.exit(1); }
});
