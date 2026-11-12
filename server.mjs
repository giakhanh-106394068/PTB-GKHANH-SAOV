import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { basename, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = resolve(fileURLToPath(new URL(".", import.meta.url)));
const port = Number(process.env.PORT ?? 4174);
const supportedFrameCounts = new Set([1, 3, 4, 6]);
const framesDirectory = join(rootDirectory, "frames");
const capturesDirectory = join(rootDirectory, "captures");
const maxJsonBytes = 80 * 1024 * 1024;
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".task": "application/octet-stream",
  ".wasm": "application/wasm",
};

for (const count of supportedFrameCounts) {
  mkdirSync(join(framesDirectory, `${count}-photo`), { recursive: true });
}
mkdirSync(capturesDirectory, { recursive: true });

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolveBody, rejectBody) => {
    let body = "";
    let receivedBytes = 0;
    let tooLarge = false;

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      receivedBytes += Buffer.byteLength(chunk);
      if (receivedBytes > maxJsonBytes) {
        tooLarge = true;
        body = "";
        return;
      }
      if (!tooLarge) body += chunk;
    });
    request.on("end", () => {
      if (tooLarge) {
        const error = new Error("Dữ liệu ảnh quá lớn");
        error.statusCode = 413;
        rejectBody(error);
        return;
      }
      try {
        resolveBody(body ? JSON.parse(body) : {});
      } catch {
        const error = new Error("Dữ liệu gửi lên không hợp lệ");
        error.statusCode = 400;
        rejectBody(error);
      }
    });
    request.on("error", rejectBody);
  });
}

function timestampName(date = new Date()) {
  const part = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    part(date.getMonth() + 1),
    part(date.getDate()),
  ].join("-") + "_" + [
    part(date.getHours()),
    part(date.getMinutes()),
    part(date.getSeconds()),
  ].join("-");
}

function createCaptureSession() {
  const baseName = timestampName();
  let sessionId = baseName;
  let suffix = 2;
  while (existsSync(join(capturesDirectory, sessionId))) {
    sessionId = `${baseName}-${String(suffix).padStart(2, "0")}`;
    suffix += 1;
  }
  mkdirSync(join(capturesDirectory, sessionId));
  return {
    sessionId,
    relativeDirectory: `captures/${sessionId}`,
  };
}

function captureSessionDirectory(sessionId) {
  if (typeof sessionId !== "string" || !/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(?:-\d{2})?$/.test(sessionId)) {
    const error = new Error("Mã lượt chụp không hợp lệ");
    error.statusCode = 400;
    throw error;
  }
  const directory = join(capturesDirectory, sessionId);
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    const error = new Error("Không tìm thấy folder của lượt chụp");
    error.statusCode = 404;
    throw error;
  }
  return directory;
}

function decodeImageDataUrl(dataUrl, allowedTypes) {
  if (typeof dataUrl !== "string") {
    const error = new Error("Thiếu dữ liệu ảnh");
    error.statusCode = 400;
    throw error;
  }
  const match = /^data:image\/(jpeg|jpg|png);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl);
  if (!match || !allowedTypes.has(match[1])) {
    const error = new Error("Định dạng ảnh không hợp lệ");
    error.statusCode = 400;
    throw error;
  }
  const image = Buffer.from(match[2], "base64");
  if (!image.length) {
    const error = new Error("File ảnh trống");
    error.statusCode = 400;
    throw error;
  }
  return image;
}

function sendApiError(response, error, fallbackMessage) {
  console.error(fallbackMessage, error);
  sendJson(response, Number(error.statusCode) || 500, {
    error: error.message || fallbackMessage,
  });
}

function frameDisplayName(filename) {
  const rawName = basename(filename, extname(filename)).replace(/[-_]+/g, " ").trim();
  return rawName ? rawName.charAt(0).toLocaleUpperCase("vi-VN") + rawName.slice(1) : "Frame";
}

function listReadyFrames(count) {
  const folderName = `${count}-photo`;
  const directory = join(framesDirectory, folderName);
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".png")
    .map((entry) => {
      const filePath = join(directory, entry.name);
      const version = Math.round(statSync(filePath).mtimeMs);
      return {
        id: entry.name.toLocaleLowerCase("vi-VN"),
        name: frameDisplayName(entry.name),
        url: `/frames/${folderName}/${encodeURIComponent(entry.name)}?v=${version}`,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "vi-VN"));
}

createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  const pathname = decodeURIComponent(requestUrl.pathname);

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Origin": "*",
    });
    response.end();
    return;
  }

  if (pathname === "/api/runtime") {
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }
    sendJson(response, 200, {
      port,
      rootDirectory,
      gestureModulesSupported: true,
    });
    return;
  }

  if (pathname === "/api/frames") {
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }

    const count = Number(requestUrl.searchParams.get("count"));
    if (!supportedFrameCounts.has(count)) {
      sendJson(response, 400, { error: "Số lượng ảnh phải là 1, 3, 4 hoặc 6" });
      return;
    }

    try {
      sendJson(response, 200, { count, frames: listReadyFrames(count) });
    } catch (error) {
      console.error("Không thể quét frame:", error);
      sendJson(response, 500, { error: "Không thể quét thư mục frame" });
    }
    return;
  }

  if (pathname === "/api/captures/session") {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }
    try {
      const body = await readJson(request);
      const shotCount = Number(body.shotCount);
      if (!supportedFrameCounts.has(shotCount)) {
        const error = new Error("Số lượng ảnh phải là 1, 3, 4 hoặc 6");
        error.statusCode = 400;
        throw error;
      }
      sendJson(response, 201, createCaptureSession());
    } catch (error) {
      sendApiError(response, error, "Không thể tạo folder cho lượt chụp");
    }
    return;
  }

  if (pathname === "/api/captures/photo") {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }
    try {
      const body = await readJson(request);
      const index = Number(body.index);
      if (!Number.isInteger(index) || index < 1 || index > 6) {
        const error = new Error("Số thứ tự ảnh không hợp lệ");
        error.statusCode = 400;
        throw error;
      }
      const directory = captureSessionDirectory(body.sessionId);
      const filename = `photo-${String(index).padStart(2, "0")}.jpg`;
      const image = decodeImageDataUrl(body.dataUrl, new Set(["jpeg", "jpg"]));
      writeFileSync(join(directory, filename), image);
      sendJson(response, 200, { saved: true, filename });
    } catch (error) {
      sendApiError(response, error, "Không thể lưu ảnh vừa chụp");
    }
    return;
  }

  if (pathname === "/api/captures/final") {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }
    try {
      const body = await readJson(request);
      const directory = captureSessionDirectory(body.sessionId);
      const image = decodeImageDataUrl(body.dataUrl, new Set(["png"]));
      const finalPath = join(directory, "final.png");
      writeFileSync(finalPath, image);
      const finalStats = statSync(finalPath);
      if (!finalStats.isFile() || finalStats.size === 0) {
        throw new Error("File final.png chưa được ghi hoàn chỉnh");
      }
      sendJson(response, 200, {
        saved: true,
        filename: "final.png",
        bytes: finalStats.size,
        relativeDirectory: `captures/${body.sessionId}`,
      });
    } catch (error) {
      sendApiError(response, error, "Không thể lưu ảnh final");
    }
    return;
  }

  if (pathname === "/api/captures/open-folder") {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }
    try {
      const body = await readJson(request);
      const directory = captureSessionDirectory(body.sessionId);
      if (process.platform !== "win32") {
        const error = new Error("Tính năng mở folder hiện chỉ hỗ trợ Windows");
        error.statusCode = 501;
        throw error;
      }
      const explorer = spawn("explorer.exe", [directory], {
        detached: true,
        stdio: "ignore",
        windowsHide: false,
      });
      explorer.unref();
      sendJson(response, 200, { opened: true, relativeDirectory: `captures/${body.sessionId}` });
    } catch (error) {
      sendApiError(response, error, "Không thể mở folder ảnh");
    }
    return;
  }

  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const normalizedPath = normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = resolve(rootDirectory, normalizedPath);

  if (
    (filePath !== rootDirectory && !filePath.startsWith(rootDirectory + sep)) ||
    !existsSync(filePath) ||
    !statSync(filePath).isFile()
  ) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Type": contentTypes[extname(filePath)] ?? "application/octet-stream",
  });
  createReadStream(filePath).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`SAOV Photobooth đang chạy tại http://127.0.0.1:${port}`);
});
