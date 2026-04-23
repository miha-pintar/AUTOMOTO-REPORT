import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const port = Number(process.env.PORT || 5173);
const root = resolve(process.cwd());
const sessionTtlSeconds = Number(process.env.SESSION_DAYS || 180) * 24 * 60 * 60;
const defaultViewerPasswords = ["GAreport997!", "IAB227!"];
const viewerPasswords = process.env.VIEWER_PASSWORDS
  ? process.env.VIEWER_PASSWORDS.split(",").map((value) => value.trim()).filter(Boolean)
  : [process.env.VIEWER_PASSWORD || defaultViewerPasswords[0], ...defaultViewerPasswords.slice(1)];
const passwords = {
  admin: process.env.ADMIN_PASSWORD || "Epi123!",
  viewer: viewerPasswords
};
const shareToken = process.env.SHARE_TOKEN || "ga-adriatic-2026-share-a8f4c2d9";
const sessionSecret = process.env.SESSION_SECRET || `${passwords.admin}:${passwords.viewer.join(":")}:automoto-report`;
const shareLinksPath = join(root, "data", "share-links.json");
let shareLinksWriteQueue = Promise.resolve();

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

async function readIndexHtml({ rootBase = false } = {}) {
  const file = await readFile(join(root, "index.html"), "utf8");
  return rootBase ? file.replace(/<head>/i, '<head>\n    <base href="/" />') : file;
}

async function readShareLinks() {
  try {
    const file = await readFile(shareLinksPath, "utf8");
    const data = JSON.parse(file);
    return Array.isArray(data.tokens) ? data.tokens : [];
  } catch {
    return [];
  }
}

async function saveShareLinks(tokens) {
  await mkdir(join(root, "data"), { recursive: true });
  await writeFile(shareLinksPath, `${JSON.stringify({ tokens }, null, 2)}\n`);
}

async function createShareLink(req, createdBy) {
  const protocol = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host;

  const createTask = shareLinksWriteQueue.then(async () => {
    const tokens = await readShareLinks();
    let token = randomBytes(24).toString("base64url");

    while (tokens.some((item) => item.token === token) || token === shareToken) {
      token = randomBytes(24).toString("base64url");
    }

    const nextTokens = [
      ...tokens,
      {
        token,
        createdAt: new Date().toISOString(),
        createdBy
      }
    ];
    await saveShareLinks(nextTokens);

    const path = `/share/${token}`;

    return {
      token,
      path,
      url: host ? `${protocol}://${host}${path}` : path
    };
  });

  shareLinksWriteQueue = createTask.catch(() => {});
  return createTask;
}

async function isValidSharePath(pathname) {
  const match = pathname.match(/^\/share\/([^/]+)\/?$/);
  if (!match) return false;

  const providedTokenBuffer = Buffer.from(match[1]);
  const shareTokenBuffer = Buffer.from(shareToken);

  if (
    providedTokenBuffer.length === shareTokenBuffer.length &&
    timingSafeEqual(providedTokenBuffer, shareTokenBuffer)
  ) {
    return true;
  }

  const tokens = await readShareLinks();
  return tokens.some((item) => {
    const tokenBuffer = Buffer.from(item.token || "");
    return providedTokenBuffer.length === tokenBuffer.length && timingSafeEqual(providedTokenBuffer, tokenBuffer);
  });
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
      const role = body.password === passwords.admin ? "admin" : passwords.viewer.includes(body.password) ? "viewer" : null;

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

  if (pathname === "/api/share-links" && req.method === "POST") {
    const session = getSession(req);
    if (session?.role !== "admin") {
      sendJson(res, 403, { error: "Forbidden" });
      return true;
    }

    try {
      sendJson(res, 201, await createShareLink(req, session.role));
    } catch {
      sendJson(res, 500, { error: "Share link could not be created" });
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
    if (await isValidSharePath(pathname)) {
      const file = await readIndexHtml({ rootBase: true });
      const headers = {
        "Content-Type": contentTypes[".html"],
        "Cache-Control": "no-store"
      };

      if (!session) {
        const token = createSessionToken("viewer");
        headers["Set-Cookie"] = `automoto_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionTtlSeconds}`;
      }

      res.writeHead(200, headers);
      res.end(file);
      return;
    }

    if (!session && !isPublicPath(pathname)) {
      const hasExtension = Boolean(extname(filePath));

      if (!hasExtension) {
        const file = await readIndexHtml();
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
      const file = await readIndexHtml();
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
