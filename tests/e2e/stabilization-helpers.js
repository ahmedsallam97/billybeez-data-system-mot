const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { createHmac, randomBytes } = require("node:crypto");
const { assertIsolatedEnvironment } = require("./isolation");

function database(fn, writable = false) {
  assertIsolatedEnvironment();
  const db = new DatabaseSync(process.env.DATABASE_URL.slice(5),{readOnly:!writable});
  try { return fn(db); } finally { db.close(); }
}
function roleState(role) {
  const user = database(db => db.prepare("SELECT id FROM User WHERE active=1 AND role=? LIMIT 1").get(role));
  if (!user) throw new Error(`Missing ${role} role fixture`);
  const now = Math.floor(Date.now()/1000);
  const payload = Buffer.from(JSON.stringify({sub:user.id,iat:now,exp:now+3600,jti:randomBytes(16).toString("hex"),v:1})).toString("base64url");
  const signature = createHmac("sha256",process.env.SESSION_SECRET).update(payload).digest("base64url");
  return {cookies:[{name:process.env.AUTH_COOKIE_NAME,value:`${payload}.${signature}`,domain:"127.0.0.1",path:"/",expires:now+3600,httpOnly:true,secure:false,sameSite:"Strict"}],origins:[]};
}
function evidence(name) { const dir = path.resolve(process.env.OPS_E2E_EVIDENCE_DIR || "docs/stabilization-evidence"); fs.mkdirSync(dir,{recursive:true}); return path.join(dir,name); }
function storageRoot() {
  assertIsolatedEnvironment();
  const root = path.resolve(process.env.EMPLOYEE_FILE_STORAGE_ROOT);
  if (!root.startsWith(path.resolve(process.env.OPS_E2E_RUN_DIR)+path.sep)) throw new Error("Refusing file operations outside the disposable test directory");
  return root;
}
function files() {
  const root = storageRoot();
  return fs.existsSync(root) ? fs.readdirSync(root,{recursive:true,withFileTypes:true}).filter(item => item.isFile()).map(item => path.relative(root,path.join(item.parentPath,item.name))).sort() : [];
}
async function imageFixtures(page) {
  const values = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width=180; canvas.height=180;
    const context = canvas.getContext("2d"); context.fillStyle="#43215f"; context.fillRect(0,0,180,180); context.fillStyle="#f8cd36"; context.fillRect(30,30,120,120); context.fillStyle="#43215f"; context.font="24px Arial"; context.fillText("UAT",63,98);
    return Object.fromEntries(["image/png","image/jpeg","image/webp"].map(type => [type,canvas.toDataURL(type).split(",")[1]]));
  });
  return Object.fromEntries(Object.entries(values).map(([type,value]) => [type,Buffer.from(value,"base64")]));
}
module.exports = { database, roleState, evidence, files, imageFixtures, storageRoot };
