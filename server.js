import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { createHmac, timingSafeEqual } from "node:crypto";

const port = Number(process.env.PORT || 5173);
const root = resolve(process.cwd());
const reportDataPath = join(root, "data", "report-data.json");
const sessionTtlSeconds = Number(process.env.SESSION_DAYS || 180) * 24 * 60 * 60;
const passwords = {
  admin: process.env.ADMIN_PASSWORD || "Epi123!",
  viewer: process.env.VIEWER_PASSWORD || "GAreport997!"
};
const sessionSecret = process.env.SESSION_SECRET || `${passwords.admin}:${passwords.viewer}:automoto-report`;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm"
};

function resolvePath(url) {
  const cleanUrl = decodeURIComponent(url.split("?")[0]);
  const requested = cleanUrl === "/" ? "/index.html" : cleanUrl;
  const filePath = normalize(join(root, requested));

  if (filePath !== root && !filePath.startsWith(`${root}/`)) {
    return null;
  }

  return filePath;
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const [key, ...value] = cookie.split("=");
        return [key, decodeURIComponent(value.join("="))];
      })
  );
}

function getSession(req) {
  const token = parseCookies(req.headers.cookie).automoto_session;
  return token ? verifySessionToken(token) : null;
}

function createSessionToken(role) {
  const payload = {
    role,
    expiresAt: Date.now() + sessionTtlSeconds * 1000
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${signSessionPayload(encodedPayload)}`;
}

function verifySessionToken(token) {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = signSessionPayload(encodedPayload);
  const signatureBuffer = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    return null;
  }

  try {
    const session = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if ((session.role !== "admin" && session.role !== "viewer") || session.expiresAt < Date.now()) {
      return null;
    }
    return {
      role: session.role
    };
  } catch {
    return null;
  }
}

function signSessionPayload(encodedPayload) {
  return createHmac("sha256", sessionSecret).update(encodedPayload).digest("base64url");
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        rejectBody(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolveBody(body ? JSON.parse(body) : {});
      } catch (error) {
        rejectBody(error);
      }
    });
    req.on("error", rejectBody);
  });
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/session" && req.method === "GET") {
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { error: "Unauthorized" });
      return true;
    }

    sendJson(res, 200, { role: session.role });
    return true;
  }

  if (pathname === "/api/login" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const role = body.password === passwords.admin ? "admin" : body.password === passwords.viewer ? "viewer" : null;

      if (!role) {
        sendJson(res, 401, { error: "Invalid password" });
        return true;
      }

      const token = createSessionToken(role);

      sendJson(res, 200, { role }, {
        "Set-Cookie": `automoto_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionTtlSeconds}`
      });
    } catch {
      sendJson(res, 400, { error: "Invalid request" });
    }
    return true;
  }

  if (pathname === "/api/logout" && req.method === "POST") {
    sendJson(res, 200, { ok: true }, {
      "Set-Cookie": "automoto_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
    });
    return true;
  }

  if (pathname === "/api/report-data" && req.method === "PUT") {
    const session = getSession(req);
    if (session?.role !== "admin") {
      sendJson(res, 403, { error: "Admin access required" });
      return true;
    }

    try {
      const body = await readJsonBody(req);
      await writeFile(reportDataPath, `${JSON.stringify(body, null, 2)}\n`, "utf8");
      sendJson(res, 200, { ok: true });
    } catch {
      sendJson(res, 400, { error: "Invalid report data" });
    }
    return true;
  }

  if (pathname.startsWith("/api/")) {
    sendJson(res, 404, { error: "Not found" });
    return true;
  }

  return false;
}

function isPublicPath(pathname) {
  return ["/", "/index.html", "/main.js", "/styles.css"].includes(pathname);
}

createServer(async (req, res) => {
  const pathname = decodeURIComponent((req.url || "/").split("?")[0]);

  if (await handleApi(req, res, pathname)) {
    return;
  }

  const session = getSession(req);
  const filePath = resolvePath(req.url || "/");

  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    if (!session && !isPublicPath(pathname)) {
      const hasExtension = Boolean(extname(filePath));

      if (!hasExtension) {
        const file = await readFile(join(root, "index.html"));
        res.writeHead(200, {
          "Content-Type": contentTypes[".html"],
          "Cache-Control": "no-store"
        });
        res.end(file);
        return;
      }

      res.writeHead(401, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      res.end("Unauthorized");
      return;
    }

    const file = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(file);
  } catch {
    const hasExtension = Boolean(extname(filePath));

    if (!hasExtension) {
      const file = await readFile(join(root, "index.html"));
      res.writeHead(200, {
        "Content-Type": contentTypes[".html"],
        "Cache-Control": "no-store"
      });
      res.end(file);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}).listen(port, () => {
  console.log(`Automoto Report running at http://localhost:${port}`);
});
