const fs = require("fs");
const path = require("path");

const PRODUCTS_DIR = path.join(__dirname, "..", "public", "products");
const SOURCES_FILE = path.join(PRODUCTS_DIR, "SOURCES.json");

function commonsFile(fileName, license = "Wikimedia Commons") {
  return {
    url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=640`,
    title: fileName.replace(/\.[^.]+$/, ""),
    creator: "Wikimedia Commons contributors",
    license,
    source: "Wikimedia Commons",
    page: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName).replace(/%20/g, "_")}`,
  };
}

function flickrFile({ url, title, creator = "Flickr contributor", license = "Creative Commons", page }) {
  return {
    url,
    title,
    creator,
    license,
    source: "Flickr via Openverse",
    page,
  };
}

const DIRECT_SOURCES = {
  PEPSI: {
    url: "https://images.openfoodfacts.org/images/products/406/213/901/7416/front_en.12.400.jpg",
    title: "Pepsi 330ml Can",
    creator: "Open Food Facts contributors",
    license: "Open Food Facts product image",
    source: "Open Food Facts",
    page: "https://world.openfoodfacts.org/product/4062139017416/pepsi-330ml-can",
  },
  PR001: {
    url: "https://images.openfoodfacts.org/images/products/406/213/901/7416/front_en.12.400.jpg",
    title: "Pepsi 330ml Can",
    creator: "Open Food Facts contributors",
    license: "Open Food Facts product image",
    source: "Open Food Facts",
    page: "https://world.openfoodfacts.org/product/4062139017416/pepsi-330ml-can",
  },
  WATER: commonsFile("Plastic Water Bottle.jpg", "CC BY-SA 4.0"),
  PR002: commonsFile("Plastic Water Bottle.jpg", "CC BY-SA 4.0"),
  PR004: commonsFile("Cup of black tea.JPG", "CC BY-SA 4.0"),
  PR006: commonsFile("Espresso cup.jpg", "CC BY-SA 4.0"),
  PR007: commonsFile("Close-up of espresso machine with two brown coffee cups.jpg", "CC0"),
  PR009: commonsFile("Turkish coffee in a traditional design cup.jpg", "CC BY-SA 4.0"),
  PR013: commonsFile("PLAIN CROISSANT.jpg", "CC BY-SA 4.0"),
  PR014: commonsFile("Ham & cheese croissant - Bread & Milk 2024-05-22.jpg", "CC0"),
  PR015: commonsFile("Chocolate muffin - Cosy Cottage 2025-04-21.jpg", "CC0"),
  PR017: commonsFile("Bowl of Popcorn (Unsplash).jpg", "CC0"),
  PR018: commonsFile("Popcorn in a bowl.jpg", "CC0"),
  PR021: flickrFile({
    url: "https://live.staticflickr.com/3235/3120819790_13c50c1df9_b.jpg",
    title: "Marsbar",
    creator: "Flickr contributor",
    license: "CC BY",
    page: "https://www.flickr.com/",
  }),
  PR022: commonsFile("Cotton candy in pastel pink, Shimla India.jpg", "CC0"),
  PR023: commonsFile("Cheese Fries.jpg", "CC BY 2.0"),
  PR024: commonsFile("French fries 3.jpg", "CC BY-SA 4.0"),
  FRIES: commonsFile("French fries 3.jpg", "CC BY-SA 4.0"),
  PR025: commonsFile("Chicken fettuccine alfredo.JPG", "CC BY-SA 4.0"),
  PR026: commonsFile("Fettucine Alfredo with Chicken at Sodinis Bertoluccis (8566239253).jpg", "CC BY 2.0"),
  PR027: commonsFile("Penne Arrabbiata.jpg", "CC BY-SA 4.0"),
  PR028: commonsFile("Original Mac n Cheese .jpg", "CC BY-SA 4.0"),
  PR029: commonsFile("Crêpes roulées with portobello mushrooms, leeks, crème fraiche, mixed leaves - Petit Pois Restaurant 2024-07-11.jpg", "CC0"),
  PR030: commonsFile("Crispy yellow vietnamese savory crepes, banh xeo.jpg", "CC BY 2.0"),
  PR031: commonsFile("Hot dog with homemade hot dog bun.jpg", "CC BY 2.0"),
  PR032: commonsFile("Crêpes con la Nutella.JPG", "CC BY-SA 3.0"),
  PR033: commonsFile("Handmade Chicken Shawarma Wrap - Lavash.jpg", "CC0"),
  PR034: commonsFile("Grilled Chicken Wrap, Steel Magnolias, Valdosta.JPG", "CC BY-SA 4.0"),
  PR036: commonsFile("Shish Taouk.JPG", "CC0"),
  PR037: commonsFile("Pizza with vegetables.jpg", "CC BY-SA 4.0"),
  PR038: commonsFile("Cheese pizza.2.jpg", "CC BY-SA 4.0"),
  PR039: commonsFile("B.B.Q. Chicken Pizza (26679384893).jpg", "CC BY 2.0"),
  PR042: commonsFile("Caesar salad (2).jpg", "CC BY 2.0"),
  PR043: commonsFile("Caesar Salad from Tony Roma Restaurant- March 2024 02.jpg", "CC BY-SA 4.0"),
};

const PHOTO_QUERIES = {
  WATER: "clear bottled water product photo",
  BURGER: "hamburger food photo",
  NUGGETS: "chicken nuggets food photo",
  FRIES: "french fries food photo",
  JUICE: "orange juice glass food photo",
  PR002: "clear bottled water product photo",
  PR003: "milk tea drink photo",
  PR004: "cup of tea photo",
  PR005: "cappuccino coffee photo",
  PR006: "espresso coffee cup photo",
  PR007: "double espresso coffee photo",
  PR008: "caffe latte photo",
  PR009: "Turkish coffee photo",
  PR010: "orange juice glass food photo",
  PR011: "fruit smoothie glass photo",
  PR012: "lemonade lemon juice glass photo",
  PR013: "plain croissant food photo",
  PR014: "cheese croissant food photo",
  PR015: "chocolate muffin food photo",
  PR016: "waffles food photo",
  PR017: "popcorn cup food photo",
  PR018: "flavored popcorn food photo",
  PR019: "candy sweets food photo",
  PR020: "ice cream cup food photo",
  PR021: "chocolate bar product photo",
  PR022: "cotton candy cup food photo",
  PR023: "cheese fries food photo",
  PR024: "plain french fries food photo",
  PR025: "fettuccine alfredo pasta food photo",
  PR026: "crispy chicken pasta food photo",
  PR027: "arrabbiata pasta food photo",
  PR028: "macaroni and cheese food photo",
  PR029: "chicken crepe food photo",
  PR030: "cheese crepe food photo",
  PR031: "hot dog crepe food photo",
  PR032: "nutella crepe food photo",
  PR033: "chicken wrap food photo",
  PR034: "grilled chicken wrap food photo",
  PR035: "chicken nuggets meal food photo",
  PR036: "shish taouk food photo",
  PR037: "vegetable pizza food photo",
  PR038: "cheese pizza food photo",
  PR039: "barbecue chicken pizza food photo",
  PR040: "chicken burger food photo",
  PR041: "beef burger food photo",
  PR042: "caesar salad food photo",
  PR043: "chicken caesar salad food photo",
};

function slugify(value) {
  return String(value || "product")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "product";
}

function productImagePath(productId) {
  return `/products/${slugify(productId)}.jpg`;
}

function productImageFile(productId) {
  return path.join(PRODUCTS_DIR, `${slugify(productId)}.jpg`);
}

function fallbackImageFile() {
  return path.join(PRODUCTS_DIR, "fallback.jpg");
}

function ensureProductImage() {
  fs.mkdirSync(PRODUCTS_DIR, { recursive: true });
}

function ensureFallbackImage() {
  ensureProductImage();
}

function writeFallbackFrom(productId) {
  const source = productImageFile(productId);
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, fallbackImageFile());
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sourceQueryFor(product) {
  return PHOTO_QUERIES[product.id] || `${product.name} ${product.categoryName || product.categoryId || ""} food photo`;
}

async function searchOpenverse(query) {
  const url = new URL("https://api.openverse.org/v1/images/");
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", "8");
  url.searchParams.set("license_type", "commercial,modification");
  url.searchParams.set("mature", "false");

  let response;
  let lastError;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      response = await fetch(url, {
        headers: { "User-Agent": "BillyBeezDataSystem/1.0 (local product photos)" },
      });
      break;
    } catch (error) {
      lastError = error;
      await sleep(2500 * attempt);
    }
  }

  if (!response) {
    throw lastError;
  }

  if (!response.ok) {
    throw new Error(`Openverse search failed for "${query}" with ${response.status}`);
  }

  const data = await response.json();
  const result = (data.results || []).find((item) => {
    const imageUrl = item.url || "";
    return /^https?:\/\//.test(imageUrl) && /\.(jpe?g|png|webp)(\?|$)/i.test(imageUrl);
  });

  if (!result) {
    return null;
  }

  return {
    url: result.url,
    title: result.title || query,
    creator: result.creator || "Unknown",
    license: [result.license, result.license_version].filter(Boolean).join(" "),
    source: result.source || result.provider || "Openverse",
    page: result.foreign_landing_url,
  };
}

async function resolvePhotoSource(product) {
  if (DIRECT_SOURCES[product.id]) {
    return DIRECT_SOURCES[product.id];
  }

  const queries = [
    sourceQueryFor(product),
    `${product.name} food photo`,
    `${product.categoryName || product.categoryId || "food"} food photo`,
    "restaurant food product photo",
  ];

  for (const query of queries) {
    const source = await searchOpenverse(query);
    if (source) return source;
    await sleep(250);
  }

  throw new Error(`No photo source found for ${product.id} ${product.name}`);
}

async function downloadPhoto(source, destination) {
  let response;
  let lastError;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      response = await fetch(source.url, {
        headers: { "User-Agent": "BillyBeezDataSystem/1.0 (local product photos)" },
      });
    } catch (error) {
      lastError = error;
      await sleep(3500 * attempt);
      continue;
    }

    if (![429, 503].includes(response.status)) {
      break;
    }

    await sleep(3500 * attempt);
  }

  if (!response) {
    throw lastError;
  }

  if (!response.ok) {
    throw new Error(`Image download failed with ${response.status}: ${source.url}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Source did not return an image: ${source.url}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destination, buffer);
}

async function syncProductPhoto(product) {
  ensureProductImage();

  const source = await resolvePhotoSource(product);
  const destination = productImageFile(product.id);
  await downloadPhoto(source, destination);

  return {
    id: product.id,
    name: product.name,
    imageUrl: productImagePath(product.id),
    source,
  };
}

function writeSources(sources) {
  fs.writeFileSync(SOURCES_FILE, `${JSON.stringify(sources, null, 2)}\n`);
}

module.exports = {
  ensureFallbackImage,
  ensureProductImage,
  productImagePath,
  syncProductPhoto,
  writeFallbackFrom,
  writeSources,
};
