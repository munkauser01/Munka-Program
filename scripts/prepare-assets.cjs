// Recreate the current Munka logo assets from the repository's text payload.
const fs = require("node:fs"),
  path = require("node:path");
const source = path.join(__dirname, "asset-data.json");
if (fs.existsSync(source)) {
  fs.mkdirSync(path.join(__dirname, "../assets"), { recursive: true });
  for (const [name, data] of Object.entries(
    JSON.parse(fs.readFileSync(source, "utf8")),
  ))
    fs.writeFileSync(
      path.join(__dirname, "../assets", path.basename(name)),
      Buffer.from(data, "base64"),
    );
}

