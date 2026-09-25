const fs = require("node:fs/promises");
const path = require("node:path");
const { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

let s3Client;

function localRoot() {
  return process.env.EMPLOYEE_FILE_STORAGE_ROOT
    ? path.resolve(/* turbopackIgnore: true */ process.env.EMPLOYEE_FILE_STORAGE_ROOT)
    : path.join(/* turbopackIgnore: true */ process.cwd(), "storage", "employee-files");
}

function provider() {
  return String(process.env.EMPLOYEE_FILE_STORAGE_PROVIDER || "local").toLowerCase();
}

function assertStorageKey(storageKey) {
  const key = String(storageKey || "").replaceAll("\\", "/");
  if (!key || key.startsWith("/") || key.split("/").includes("..")) throw new Error("Invalid employee file storage key");
  return key;
}

function localPath(storageKey) {
  const root = localRoot();
  const target = path.resolve(/* turbopackIgnore: true */ root, assertStorageKey(storageKey));
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error("Invalid employee file storage path");
  return target;
}

function s3Config() {
  const bucket = process.env.EMPLOYEE_FILE_S3_BUCKET;
  const region = process.env.EMPLOYEE_FILE_S3_REGION || "us-east-1";
  if (!bucket) throw new Error("EMPLOYEE_FILE_S3_BUCKET is required when employee file storage uses S3");
  if (!s3Client) {
    const accessKeyId = process.env.EMPLOYEE_FILE_S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.EMPLOYEE_FILE_S3_SECRET_ACCESS_KEY;
    s3Client = new S3Client({
      region,
      endpoint: process.env.EMPLOYEE_FILE_S3_ENDPOINT || undefined,
      forcePathStyle: process.env.EMPLOYEE_FILE_S3_FORCE_PATH_STYLE === "true",
      credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
    });
  }
  return { bucket, client: s3Client };
}

function s3Key(storageKey) {
  const prefix = String(process.env.EMPLOYEE_FILE_S3_PREFIX || "employee-files").replace(/^\/+|\/+$/g, "");
  return [prefix, assertStorageKey(storageKey)].filter(Boolean).join("/");
}

async function writeEmployeeFile(storageKey, data, contentType) {
  const key = assertStorageKey(storageKey);
  const body = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (provider() === "local") {
    const target = localPath(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
    return;
  }
  if (provider() !== "s3") throw new Error(`Unsupported employee file storage provider: ${provider()}`);
  const { bucket, client } = s3Config();
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: s3Key(key), Body: body, ContentType: contentType || "application/octet-stream", ServerSideEncryption: process.env.EMPLOYEE_FILE_S3_SSE || undefined }));
}

async function readEmployeeFile(storageKey) {
  const key = assertStorageKey(storageKey);
  if (provider() === "local") return fs.readFile(localPath(key));
  if (provider() !== "s3") throw new Error(`Unsupported employee file storage provider: ${provider()}`);
  const { bucket, client } = s3Config();
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: s3Key(key) }));
  if (!response.Body) throw new Error("Stored employee file is empty");
  return Buffer.from(await response.Body.transformToByteArray());
}

async function deleteEmployeeFile(storageKey) {
  const key = assertStorageKey(storageKey);
  if (provider() === "local") return fs.rm(localPath(key), { force: true });
  if (provider() !== "s3") throw new Error(`Unsupported employee file storage provider: ${provider()}`);
  const { bucket, client } = s3Config();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: s3Key(key) }));
}

function employeeFileStorageInfo() {
  return provider() === "local" ? { provider: "local", root: localRoot() } : { provider: "s3", bucket: process.env.EMPLOYEE_FILE_S3_BUCKET, prefix: process.env.EMPLOYEE_FILE_S3_PREFIX || "employee-files" };
}

module.exports = { deleteEmployeeFile, employeeFileStorageInfo, readEmployeeFile, writeEmployeeFile };
