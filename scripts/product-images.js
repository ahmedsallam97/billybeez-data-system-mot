const fs = require("fs");
const path = require("path");

const PRODUCTS_DIR = path.join(__dirname, "..", "public", "products");

const palettes = [
  { bg: "#f8c800", bg2: "#fff4bf", accent: "#301848", accent2: "#e01838", soft: "#ffffff" },
  { bg: "#301848", bg2: "#f1e8fb", accent: "#e01838", accent2: "#36acd4", soft: "#ffffff" },
  { bg: "#36acd4", bg2: "#e7f7fb", accent: "#301848", accent2: "#ff671f", soft: "#ffffff" },
  { bg: "#31aa2f", bg2: "#e8f8e5", accent: "#301848", accent2: "#f8c800", soft: "#ffffff" },
  { bg: "#e94b96", bg2: "#fde8f3", accent: "#301848", accent2: "#f8c800", soft: "#ffffff" },
];

function slugify(value) {
  return String(value || "product")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "product";
}

function productImagePath(productId) {
  return `/products/${slugify(productId)}.svg`;
}

function filePathForProduct(productId) {
  return path.join(PRODUCTS_DIR, `${slugify(productId)}.svg`);
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hash(value) {
  return String(value || "")
    .split("")
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function wrapLabel(value) {
  const words = String(value || "Product").trim().split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > 18 && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines.slice(0, 2);
}

function productKind(product) {
  const text = `${product.name || ""} ${product.categoryName || ""}`.toLowerCase();

  if (text.includes("coffee") || text.includes("espresso") || text.includes("latte") || text.includes("cappuccino") || text.includes("tea")) return "coffee";
  if (text.includes("water")) return "water";
  if (text.includes("juice") || text.includes("smoothie") || text.includes("pepsi") || text.includes("drink")) return "drink";
  if (text.includes("burger")) return "burger";
  if (text.includes("fries")) return "fries";
  if (text.includes("pizza")) return "pizza";
  if (text.includes("pasta") || text.includes("mac")) return "pasta";
  if (text.includes("salad")) return "salad";
  if (text.includes("croissant") || text.includes("muffin") || text.includes("waffle") || text.includes("bakery")) return "bakery";
  if (text.includes("crepe") || text.includes("roll") || text.includes("hotdog") || text.includes("tawouk")) return "wrap";
  if (text.includes("nugget")) return "nuggets";
  if (text.includes("popcorn")) return "popcorn";
  if (text.includes("ice cream")) return "icecream";
  if (text.includes("candy") || text.includes("chocolate")) return "candy";
  return "snack";
}

function iconSvg(kind, palette) {
  const a = palette.accent;
  const b = palette.accent2;

  const icons = {
    water: `<rect x="130" y="54" width="60" height="108" rx="16" fill="${a}"/><rect x="140" y="44" width="40" height="18" rx="7" fill="${b}"/><rect x="142" y="88" width="36" height="44" rx="10" fill="#e7f7fb"/><path d="M150 111c8-13 13-20 18-31 5 11 10 18 18 31 0 13-8 22-18 22s-18-9-18-22z" fill="${palette.bg}"/>`,
    drink: `<rect x="112" y="62" width="96" height="98" rx="18" fill="${a}"/><path d="M124 62h72l-10 98h-52z" fill="${b}"/><path d="M143 48h82" stroke="${a}" stroke-width="10" stroke-linecap="round"/><path d="M207 50l-24 72" stroke="#ffffff" stroke-width="8" stroke-linecap="round"/><circle cx="160" cy="110" r="21" fill="#ffffff" opacity=".9"/>`,
    coffee: `<rect x="108" y="82" width="104" height="66" rx="16" fill="${a}"/><path d="M212 94h16c14 0 14 42 0 42h-16" fill="none" stroke="${a}" stroke-width="12"/><rect x="126" y="146" width="76" height="14" rx="7" fill="${b}"/><path d="M134 62c-8-12 8-18 0-30M160 62c-8-12 8-18 0-30M186 62c-8-12 8-18 0-30" stroke="${b}" stroke-width="7" stroke-linecap="round"/>`,
    burger: `<path d="M93 97c8-32 126-32 134 0z" fill="${b}"/><rect x="88" y="98" width="144" height="22" rx="11" fill="${a}"/><rect x="94" y="124" width="132" height="16" rx="8" fill="#31aa2f"/><rect x="90" y="142" width="140" height="18" rx="9" fill="${a}"/><path d="M98 166h124c-8 23-116 23-124 0z" fill="${b}"/><circle cx="137" cy="80" r="5" fill="#fff"/><circle cx="160" cy="76" r="5" fill="#fff"/><circle cx="184" cy="81" r="5" fill="#fff"/>`,
    fries: `<path d="M112 92h96l-12 84h-72z" fill="${a}"/><path d="M112 92h96l-12 24h-72z" fill="${b}"/><path d="M124 46v62M148 38v70M172 42v66M196 50v58" stroke="#f8c800" stroke-width="14" stroke-linecap="round"/><path d="M137 134h46" stroke="#fff" stroke-width="8" stroke-linecap="round"/>`,
    pizza: `<path d="M108 47l112 128c-42 19-91 11-132-18z" fill="${b}"/><path d="M108 47c40 2 83 43 112 128" stroke="${a}" stroke-width="16" stroke-linecap="round"/><circle cx="141" cy="96" r="11" fill="${a}"/><circle cx="168" cy="126" r="10" fill="${a}"/><circle cx="188" cy="153" r="8" fill="${a}"/>`,
    pasta: `<ellipse cx="160" cy="141" rx="78" ry="31" fill="${a}"/><ellipse cx="160" cy="128" rx="66" ry="25" fill="#fff4bf"/><path d="M112 126c31-28 62 29 96 0M118 138c27-25 60 24 84 0M139 114c17-18 36 17 54 0" stroke="${b}" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="148" cy="129" r="8" fill="${a}"/><circle cx="181" cy="136" r="7" fill="${a}"/>`,
    salad: `<ellipse cx="160" cy="143" rx="76" ry="28" fill="${a}"/><path d="M94 128h132c-12 40-120 40-132 0z" fill="${palette.bg2}"/><circle cx="133" cy="120" r="18" fill="#31aa2f"/><circle cx="164" cy="112" r="20" fill="#36acd4"/><circle cx="191" cy="123" r="16" fill="#ff671f"/>`,
    bakery: `<path d="M88 126c28-55 116-70 148 0-42 35-109 35-148 0z" fill="${b}"/><path d="M112 123c12-23 32-38 48-44 16 6 36 21 48 44" fill="none" stroke="${a}" stroke-width="12" stroke-linecap="round"/><path d="M126 134c28 15 53 15 68 0" stroke="#fff" stroke-width="8" stroke-linecap="round"/>`,
    wrap: `<path d="M111 58h98l-21 110h-56z" fill="${a}"/><path d="M123 66h74l-9 44h-56z" fill="#fff4bf"/><path d="M126 76h70M121 102h70M116 128h70" stroke="${b}" stroke-width="8" stroke-linecap="round"/><circle cx="143" cy="91" r="8" fill="#31aa2f"/><circle cx="172" cy="88" r="8" fill="#e01838"/>`,
    nuggets: `<path d="M108 108c-8-26 38-49 55-22 22-19 63 2 50 31 20 22-10 54-39 38-17 22-62 15-62-13-26-1-32-26-4-34z" fill="${b}"/><path d="M130 111c12-8 25-9 39-3M146 134c15 8 31 8 45-2" stroke="${a}" stroke-width="8" stroke-linecap="round"/>`,
    popcorn: `<path d="M104 90h112l-14 84h-84z" fill="${a}"/><path d="M121 90l8 84M151 90l3 84M184 90l-7 84" stroke="#fff" stroke-width="9"/><circle cx="121" cy="78" r="18" fill="#fff4bf"/><circle cx="151" cy="69" r="19" fill="#fff4bf"/><circle cx="184" cy="77" r="18" fill="#fff4bf"/><circle cx="161" cy="89" r="19" fill="#fff4bf"/>`,
    icecream: `<path d="M132 105h56l-28 68z" fill="${b}"/><circle cx="160" cy="82" r="34" fill="${a}"/><circle cx="137" cy="93" r="24" fill="${palette.bg}"/><circle cx="185" cy="95" r="24" fill="${palette.bg2}"/>`,
    candy: `<rect x="112" y="91" width="96" height="54" rx="14" fill="${a}"/><path d="M112 118l-42-28v56zM208 118l42-28v56z" fill="${b}"/><path d="M135 102l50 32" stroke="#fff" stroke-width="8" stroke-linecap="round"/><path d="M185 102l-50 32" stroke="#fff" stroke-width="8" stroke-linecap="round"/>`,
    snack: `<rect x="105" y="72" width="110" height="88" rx="22" fill="${a}"/><path d="M126 100h68M126 124h68" stroke="#fff" stroke-width="10" stroke-linecap="round"/><circle cx="160" cy="58" r="18" fill="${b}"/>`,
  };

  return icons[kind] || icons.snack;
}

function buildProductSvg(product) {
  const palette = palettes[hash(product.id || product.name) % palettes.length];
  const kind = productKind(product);
  const lines = wrapLabel(product.name);
  const category = product.categoryName || product.categoryId || "Product";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240" role="img" aria-label="${escapeXml(product.name)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${palette.bg2}"/>
      <stop offset="1" stop-color="${palette.bg}"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="7" flood-color="#301848" flood-opacity=".18"/>
    </filter>
  </defs>
  <rect width="320" height="240" rx="0" fill="url(#bg)"/>
  <g opacity=".16" fill="none" stroke="${palette.accent}" stroke-width="4">
    <path d="M20 54l24-14 24 14v28L44 96 20 82z"/>
    <path d="M252 36l24-14 24 14v28l-24 14-24-14z"/>
    <path d="M232 156l28-16 28 16v32l-28 16-28-16z"/>
  </g>
  <g filter="url(#shadow)">
    <path d="M72 36h176l40 70-40 70H72l-40-70z" fill="${palette.soft}" opacity=".94"/>
    ${iconSvg(kind, palette)}
  </g>
  <rect x="24" y="188" width="272" height="35" rx="17" fill="#ffffff" opacity=".92"/>
  ${lines.map((line, index) => `<text x="160" y="${205 + index * 16}" text-anchor="middle" font-family="Avenir Next, Segoe UI, Arial, sans-serif" font-size="${lines.length > 1 ? 14 : 16}" font-weight="800" fill="#301848">${escapeXml(line)}</text>`).join("\n  ")}
  <text x="160" y="28" text-anchor="middle" font-family="Avenir Next, Segoe UI, Arial, sans-serif" font-size="12" font-weight="800" fill="#301848" opacity=".75">${escapeXml(category)}</text>
</svg>
`;
}

function ensureFallbackImage() {
  fs.mkdirSync(PRODUCTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(PRODUCTS_DIR, "fallback.svg"), buildProductSvg({
    id: "fallback",
    name: "Product",
    categoryName: "BillyBeez",
  }));
}

function ensureProductImage(product) {
  fs.mkdirSync(PRODUCTS_DIR, { recursive: true });
  fs.writeFileSync(filePathForProduct(product.id), buildProductSvg(product));
}

module.exports = {
  ensureFallbackImage,
  ensureProductImage,
  productImagePath,
  slugify,
};
