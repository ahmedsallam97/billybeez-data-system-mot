const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "app");
const extensions = new Set([".js", ".jsx", ".ts", ".tsx"]);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    if (extensions.has(path.extname(entry.name))) return [fullPath];
    return [];
  });
}

function lineNumber(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function hasAny(tag, attributes) {
  return attributes.some((attr) => new RegExp(`\\s${attr}(?:\\s*=|\\s|>)`, "i").test(tag));
}

function auditFile(file) {
  const source = fs.readFileSync(file, "utf8");
  const issues = [];
  const rel = path.relative(path.join(__dirname, ".."), file);

  for (const match of source.matchAll(/<img\b[^>]*>/gi)) {
    if (!hasAny(match[0], ["alt"])) {
      issues.push(`${rel}:${lineNumber(source, match.index)} img is missing alt`);
    }
  }

  for (const match of source.matchAll(/<select\b[^>]*>/gi)) {
    if (!hasAny(match[0], ["aria-label", "title", "name"])) {
      issues.push(`${rel}:${lineNumber(source, match.index)} select is missing an accessible name`);
    }
  }

  for (const match of source.matchAll(/<textarea\b[^>]*>/gi)) {
    if (!hasAny(match[0], ["aria-label", "title", "name", "placeholder"])) {
      issues.push(`${rel}:${lineNumber(source, match.index)} textarea is missing an accessible name`);
    }
  }

  for (const match of source.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
    const button = match[0];
    const body = match[2].replace(/<[^>]+>/g, "").replace(/[{}()=>?.:'"`;,]/g, "").trim();
    if (!body && !hasAny(button, ["aria-label", "title"])) {
      issues.push(`${rel}:${lineNumber(source, match.index)} button is missing an accessible name`);
    }
  }

  return issues;
}

const issues = walk(root).flatMap(auditFile);

if (issues.length) {
  console.error("UI audit failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("UI audit passed");
