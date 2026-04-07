import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const normalizedRoot = rootDirectory.endsWith(path.sep) ? rootDirectory : `${rootDirectory}${path.sep}`;
const port = Number(process.env.PORT) || 3000;

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function getContentType(filePath) {
  return contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function getCacheControl(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".html") {
    return "no-cache";
  }

  return "public, max-age=31536000, immutable";
}

async function resolveFilePath(requestUrl) {
  const url = new URL(requestUrl || "/", `http://localhost:${port}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === "/" || pathname === "") {
    return path.join(rootDirectory, "index.html");
  }

  const relativePath = pathname.replace(/^\/+/, "");
  const candidatePath = path.resolve(rootDirectory, relativePath);

  if (!candidatePath.startsWith(normalizedRoot)) {
    return null;
  }

  try {
    const fileStats = await stat(candidatePath);

    if (fileStats.isDirectory()) {
      return path.join(candidatePath, "index.html");
    }

    return candidatePath;
  } catch {
    if (path.extname(relativePath)) {
      return null;
    }

    return path.join(rootDirectory, "index.html");
  }
}

const server = createServer(async (request, response) => {
  if (!request.method || !["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Method Not Allowed");
    return;
  }

  const filePath = await resolveFilePath(request.url || "/");

  if (!filePath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not Found");
    return;
  }

  try {
    const fileStats = await stat(filePath);
    const contentType = getContentType(filePath);
    const cacheControl = getCacheControl(filePath);
    const lastModified = fileStats.mtime.toUTCString();
    const ifModifiedSince = request.headers["if-modified-since"];

    if (ifModifiedSince) {
      const requestDate = new Date(ifModifiedSince);

      if (!Number.isNaN(requestDate.getTime()) && fileStats.mtime <= requestDate) {
        response.writeHead(304, {
          "Cache-Control": cacheControl,
          "Last-Modified": lastModified,
        });
        response.end();
        return;
      }
    }

    response.writeHead(200, {
      "Cache-Control": cacheControl,
      "Content-Length": fileStats.size,
      "Content-Type": contentType,
      "Last-Modified": lastModified,
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    const stream = createReadStream(filePath);

    stream.on("error", () => {
      if (!response.headersSent) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      }
      response.end("Not Found");
    });

    stream.pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not Found");
  }
});

server.listen(port, () => {
  console.log(`Static server running at http://localhost:${port}`);
});