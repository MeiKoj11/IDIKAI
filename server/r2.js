/*
  r2.js
  -----
  Minimal, dependency-free client for Cloudflare R2 (its S3-compatible
  object storage), used by the Main Hub's Storage Locker to store real
  uploaded files (PDFs, Word docs) outside the SQLite database/backup
  system — db.js is explicitly sized for small text-only data, not
  binary files, so this deliberately never touches it.

  Implements AWS Signature Version 4 (SigV4) signing by hand, using
  only Node's built-in `crypto` and `https` — no AWS SDK, no
  third-party S3 client — to keep this app's zero-npm-dependency
  philosophy intact (see server.js's file header). SigV4 is a stable,
  fully documented algorithm that hasn't changed in over a decade, so
  hand-rolling it once here is a reasonable one-time cost.

  Configure via four env vars (see server/.env.example):
    R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
  If any are missing, every function below throws a clear "not
  configured" error instead of crashing — so the rest of the Storage
  Locker (links) keeps working even on a server that never set up R2.
*/

const crypto = require("crypto");
const https = require("https");

const REGION = "auto";
const SERVICE = "s3";

function getConfig() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket, host: `${accountId}.r2.cloudflarestorage.com` };
}

function isR2Configured() {
  return getConfig() !== null;
}

function sha256Hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function hmac(key, data) {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

// Returns e.g. { amzDate: "20260101T120000Z", dateStamp: "20260101" }.
function amzDateStamp(date) {
  const amzDate = date.toISOString().replace(/[:-]/g, "").replace(/\.\d{3}/, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

function getSigningKey(secretAccessKey, dateStamp) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, "aws4_request");
}

// AWS's percent-encoding rules are slightly stricter than
// encodeURIComponent's (it also encodes !'()* — AWS wants those
// encoded too), and slashes are handled separately by callers.
function uriEncode(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function encodeKeyForPath(key) {
  return "/" + key.split("/").map(uriEncode).join("/");
}

function canonicalQueryString(params) {
  return Object.keys(params)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(params[k])}`)
    .join("&");
}

// Signs and sends a header-authenticated S3 request (PUT/DELETE) — the
// signature goes in the Authorization header, not the URL.
function signedRequest({ method, key, extraHeaders = {}, body = Buffer.alloc(0) }) {
  const config = getConfig();
  if (!config) throw new Error("Storage Locker file uploads aren't configured (missing R2 env vars).");

  const now = new Date();
  const { amzDate, dateStamp } = amzDateStamp(now);
  const payloadHash = sha256Hex(body);
  const canonicalUri = encodeKeyForPath(`${config.bucket}/${key}`);

  const headers = {
    host: config.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...extraHeaders,
  };
  const sortedKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${String(headers[k]).trim()}\n`).join("");
  const signedHeadersList = sortedKeys.join(";");

  const canonicalRequest = [method, canonicalUri, "", canonicalHeaders, signedHeadersList, payloadHash].join("\n");

  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");

  const signingKey = getSigningKey(config.secretAccessKey, dateStamp);
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeadersList}, Signature=${signature}`;

  return new Promise((resolve, reject) => {
    const request = https.request(
      { method, hostname: config.host, path: canonicalUri, headers: { ...headers, Authorization: authorization } },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const responseBody = Buffer.concat(chunks);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, body: responseBody });
          } else {
            reject(new Error(`R2 ${method} ${key} failed (${res.statusCode}): ${responseBody.toString("utf8").slice(0, 300)}`));
          }
        });
      }
    );
    request.on("error", reject);
    if (body && body.length) request.write(body);
    request.end();
  });
}

async function uploadToR2(key, buffer, contentType) {
  await signedRequest({
    method: "PUT",
    key,
    extraHeaders: { "content-type": contentType || "application/octet-stream", "content-length": String(buffer.length) },
    body: buffer,
  });
  return { key, size: buffer.length };
}

async function deleteFromR2(key) {
  await signedRequest({ method: "DELETE", key });
}

// Builds a time-limited, query-signed GET URL the browser can be
// redirected to directly — no credentials ever reach the client.
// `disposition` is "inline" (opens in the browser tab, used for PDFs)
// or "attachment" (forces a download, used for everything else).
function getPresignedDownloadUrl(key, downloadFileName, disposition, expiresSeconds) {
  const config = getConfig();
  if (!config) throw new Error("Storage Locker file uploads aren't configured (missing R2 env vars).");

  const now = new Date();
  const { amzDate, dateStamp } = amzDateStamp(now);
  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const canonicalUri = encodeKeyForPath(`${config.bucket}/${key}`);
  const safeName = String(downloadFileName || "file").replace(/["\r\n]/g, "");

  const queryParams = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${config.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresSeconds || 300),
    "X-Amz-SignedHeaders": "host",
    "response-content-disposition": `${disposition}; filename="${safeName}"`,
  };
  const canonicalQuery = canonicalQueryString(queryParams);
  const canonicalHeaders = `host:${config.host}\n`;

  const canonicalRequest = ["GET", canonicalUri, canonicalQuery, canonicalHeaders, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");
  const signingKey = getSigningKey(config.secretAccessKey, dateStamp);
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  return `https://${config.host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

module.exports = { isR2Configured, uploadToR2, deleteFromR2, getPresignedDownloadUrl };
