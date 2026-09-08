const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, "..");
http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/") {
      res.writeHead(302, { Location: "/src/index.html" });
      res.end();
      return;
    }
    const requested =
      url.pathname === "/"
        ? "/src/index.html"
        : decodeURIComponent(url.pathname);
    const file = path.resolve(root, "." + requested);
    if (
      !file.startsWith(root + path.sep) ||
      !["src", "assets"].includes(path.relative(root, file).split(path.sep)[0])
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      const data = fs.readFileSync(file);
      res.setHeader(
        "Content-Type",
        {
          ".html": "text/html",
          ".css": "text/css",
          ".mjs": "text/javascript",
          ".js": "text/javascript",
          ".png": "image/png",
          ".ico": "image/x-icon",
        }[path.extname(file)] || "text/plain",
      );
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(4318, "127.0.0.1", () =>
    console.log("Munka preview: http://127.0.0.1:4318"),
  );
