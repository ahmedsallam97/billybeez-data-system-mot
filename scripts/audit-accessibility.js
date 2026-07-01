const fs = require("fs");
const path = require("path");

const root = process.cwd();
const appDir = path.join(root, "app");
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|jsx|mjs)$/.test(entry.name)) files.push(full);
  }
}

function readTag(source, start) {
  let quote = "";
  let braceDepth = 0;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    const prev = source[index - 1];

    if (quote) {
      if (char === quote && prev !== "\\") quote = "";
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "{") braceDepth += 1;
    if (char === "}") braceDepth = Math.max(0, braceDepth - 1);
    if (char === ">" && braceDepth === 0) return source.slice(start, index + 1);
  }

  return source.slice(start);
}

function lineNumber(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function hasNearbyLabel(source, index) {
  const before = source.slice(Math.max(0, index - 420), index);
  return /<label\b/i.test(before) && !/<\/label>\s*$/i.test(before);
}

walk(appDir);

const issues = [];

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const rel = path.relative(root, file);
  const formTagPattern = /<(input|select|textarea)\b/gi;
  let match;

  while ((match = formTagPattern.exec(source))) {
    const tag = readTag(source, match.index);
    const isHidden = /type=["']hidden["']/i.test(tag);
    const hasNameOrId = /\s(name|id)=/i.test(tag);
    const hasAccessibleName = /\saria-label=|\saria-labelledby=/i.test(tag) || hasNearbyLabel(source, match.index);

    if (!isHidden && !hasNameOrId) {
      issues.push(`${rel}:${lineNumber(source, match.index)} form field missing name/id`);
    }

    if (!isHidden && !hasAccessibleName) {
      issues.push(`${rel}:${lineNumber(source, match.index)} form field missing accessible name`);
    }
  }

  const imgPattern = /<img\b/gi;
  while ((match = imgPattern.exec(source))) {
    const tag = readTag(source, match.index);
    if (!/\salt=/.test(tag)) {
      issues.push(`${rel}:${lineNumber(source, match.index)} image missing alt`);
    }
  }

  const iconButtonPattern = /<button\b[^>]*(?:qty-button|icon-toggle|product-main)[^>]*>/gi;
  while ((match = iconButtonPattern.exec(source))) {
    const tag = readTag(source, match.index);
    if (!/\saria-label=|\saria-labelledby=/.test(tag)) {
      issues.push(`${rel}:${lineNumber(source, match.index)} icon/action button missing accessible name`);
    }
  }
}

const nextConfig = fs.readFileSync(path.join(root, "next.config.js"), "utf8");
[
  "Content-Security-Policy",
  "X-Content-Type-Options",
  "X-Frame-Options",
  "Referrer-Policy",
  "Permissions-Policy",
  "X-Robots-Tag",
].forEach((header) => {
  if (!nextConfig.includes(header)) issues.push(`next.config.js missing ${header}`);
});

if (!fs.existsSync(path.join(appDir, "robots.js"))) {
  issues.push("app/robots.js missing");
}

if (issues.length) {
  console.error(issues.join("\n"));
  process.exit(1);
}

console.log("Accessibility/security/SEO static audit passed");
