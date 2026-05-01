const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DB_PATH = path.join(ROOT, "db.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

function readDb() {
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function now() {
  return new Date().toISOString();
}

function nextId(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  return hashPassword(password, salt) === stored;
}

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function seedAdmin() {
  const db = readDb();
  if (!db.users.some((user) => user.role === "admin")) {
    db.users.push({
      id: nextId(db.users),
      name: "Himo Admin",
      email: "admin@himo.local",
      role: "admin",
      passwordHash: hashPassword("admin123"),
      createdAt: now()
    });
    writeDb(db);
  }
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const index = cookie.indexOf("=");
        return [cookie.slice(0, index), decodeURIComponent(cookie.slice(index + 1))];
      })
  );
}

function getSession(req, db) {
  const sessionId = parseCookies(req).himo_session;
  const session = db.sessions.find((item) => item.id === sessionId);
  if (!session) return null;
  const user = db.users.find((item) => item.id === session.userId);
  return user ? { session, user } : null;
}

function sendJson(res, status, data, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(data));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body is too large."));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
  });
}

function requireUser(req, res, db) {
  const session = getSession(req, db);
  if (!session) sendError(res, 401, "Please log in first.");
  return session;
}

function requireAdmin(req, res, db) {
  const session = requireUser(req, res, db);
  if (!session) return null;
  if (session.user.role !== "admin") {
    sendError(res, 403, "Admin access is required.");
    return null;
  }
  return session;
}

function cleanProduct(input) {
  return {
    name: String(input.name || "").trim(),
    category: String(input.category || "").trim(),
    price: Number(input.price),
    rating: Number(input.rating || 4.5),
    stock: Number(input.stock || 0),
    image: String(input.image || "assets/product-tote.svg").trim(),
    description: String(input.description || "").trim()
  };
}

function validateProduct(product) {
  if (!product.name) return "Product name is required.";
  if (!product.category) return "Product category is required.";
  if (!Number.isFinite(product.price) || product.price <= 0) return "Product price must be greater than zero.";
  if (!Number.isFinite(product.stock) || product.stock < 0) return "Product stock cannot be negative.";
  return "";
}

async function handleApi(req, res, pathname) {
  const db = readDb();

  if (req.method === "GET" && pathname === "/api/products") {
    return sendJson(res, 200, db.products);
  }

  if (req.method === "POST" && pathname === "/api/auth/register") {
    const body = await readBody(req);
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!name || !email || password.length < 6) return sendError(res, 400, "Name, email, and a 6 character password are required.");
    if (db.users.some((user) => user.email === email)) return sendError(res, 409, "This email already has an account.");
    const user = { id: nextId(db.users), name, email, role: "customer", passwordHash: hashPassword(password), createdAt: now() };
    const session = { id: crypto.randomUUID(), userId: user.id, createdAt: now() };
    db.users.push(user);
    db.sessions.push(session);
    writeDb(db);
    return sendJson(res, 201, publicUser(user), { "Set-Cookie": `himo_session=${session.id}; HttpOnly; SameSite=Lax; Path=/` });
  }

  if (req.method === "POST" && pathname === "/api/auth/login") {
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const user = db.users.find((item) => item.email === email);
    if (!user || !verifyPassword(String(body.password || ""), user.passwordHash)) return sendError(res, 401, "Invalid email or password.");
    const session = { id: crypto.randomUUID(), userId: user.id, createdAt: now() };
    db.sessions.push(session);
    writeDb(db);
    return sendJson(res, 200, publicUser(user), { "Set-Cookie": `himo_session=${session.id}; HttpOnly; SameSite=Lax; Path=/` });
  }

  if (req.method === "POST" && pathname === "/api/auth/logout") {
    const sessionId = parseCookies(req).himo_session;
    db.sessions = db.sessions.filter((session) => session.id !== sessionId);
    writeDb(db);
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": "himo_session=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/" });
  }

  if (req.method === "POST" && pathname === "/api/auth/change-password") {
    const session = requireUser(req, res, db);
    if (!session) return;
    const body = await readBody(req);
    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");
    if (newPassword.length < 6) return sendError(res, 400, "New password must be at least 6 characters.");
    const user = db.users.find((item) => item.id === session.user.id);
    if (!verifyPassword(currentPassword, user.passwordHash)) return sendError(res, 401, "Current password is incorrect.");
    user.passwordHash = hashPassword(newPassword);
    user.updatedAt = now();
    db.sessions = db.sessions.filter((item) => item.userId !== user.id || item.id === session.session.id);
    writeDb(db);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && pathname === "/api/auth/me") {
    const session = getSession(req, db);
    return sendJson(res, 200, { user: publicUser(session && session.user) });
  }

  if (req.method === "GET" && pathname === "/api/orders") {
    const session = requireUser(req, res, db);
    if (!session) return;
    const orders = session.user.role === "admin" ? db.orders : db.orders.filter((order) => order.userId === session.user.id);
    return sendJson(res, 200, orders);
  }

  if (req.method === "POST" && pathname === "/api/orders") {
    const session = requireUser(req, res, db);
    if (!session) return;
    const body = await readBody(req);
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return sendError(res, 400, "Cart is empty.");
    const orderItems = [];
    for (const item of items) {
      const product = db.products.find((candidate) => candidate.id === Number(item.id));
      const quantity = Math.max(1, Number(item.quantity) || 1);
      if (!product) return sendError(res, 400, "A product in the cart no longer exists.");
      if (product.stock < quantity) return sendError(res, 400, `${product.name} does not have enough stock.`);
      orderItems.push({ productId: product.id, name: product.name, price: product.price, quantity });
    }
    const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const units = orderItems.reduce((sum, item) => sum + item.quantity, 0);
    const discount = units >= 3 ? subtotal * 0.2 : 0;
    const delivery = subtotal - discount >= 60 ? 0 : 8;
    const order = {
      id: nextId(db.orders),
      userId: session.user.id,
      customerName: session.user.name,
      customerEmail: session.user.email,
      items: orderItems,
      subtotal,
      discount,
      delivery,
      total: subtotal - discount + delivery,
      status: "New",
      createdAt: now()
    };
    orderItems.forEach((item) => {
      const product = db.products.find((candidate) => candidate.id === item.productId);
      product.stock -= item.quantity;
    });
    db.orders.push(order);
    writeDb(db);
    return sendJson(res, 201, order);
  }

  if (req.method === "PATCH" && pathname.startsWith("/api/orders/")) {
    const session = requireAdmin(req, res, db);
    if (!session) return;
    const orderId = Number(pathname.split("/").pop());
    const order = db.orders.find((item) => item.id === orderId);
    if (!order) return sendError(res, 404, "Order not found.");
    const body = await readBody(req);
    order.status = String(body.status || order.status);
    order.updatedAt = now();
    writeDb(db);
    return sendJson(res, 200, order);
  }

  if (req.method === "GET" && pathname === "/api/admin/users") {
    const session = requireAdmin(req, res, db);
    if (!session) return;
    return sendJson(res, 200, db.users.filter((user) => user.role === "customer").map(publicUser));
  }

  if (req.method === "POST" && pathname === "/api/admin/products") {
    const session = requireAdmin(req, res, db);
    if (!session) return;
    const product = cleanProduct(await readBody(req));
    const error = validateProduct(product);
    if (error) return sendError(res, 400, error);
    product.id = nextId(db.products);
    db.products.push(product);
    writeDb(db);
    return sendJson(res, 201, product);
  }

  if ((req.method === "PUT" || req.method === "DELETE") && pathname.startsWith("/api/admin/products/")) {
    const session = requireAdmin(req, res, db);
    if (!session) return;
    const productId = Number(pathname.split("/").pop());
    const product = db.products.find((item) => item.id === productId);
    if (!product) return sendError(res, 404, "Product not found.");
    if (req.method === "DELETE") {
      db.products = db.products.filter((item) => item.id !== productId);
      writeDb(db);
      return sendJson(res, 200, { ok: true });
    }
    const updates = cleanProduct(await readBody(req));
    const error = validateProduct(updates);
    if (error) return sendError(res, 400, error);
    Object.assign(product, updates);
    writeDb(db);
    return sendJson(res, 200, product);
  }

  if (req.method === "GET" && pathname === "/api/chat") {
    const session = requireUser(req, res, db);
    if (!session) return;
    const requestedUserId = Number(new URL(req.url, `http://${req.headers.host}`).searchParams.get("userId"));
    const userId = session.user.role === "admin" && requestedUserId ? requestedUserId : session.user.id;
    return sendJson(res, 200, db.messages.filter((message) => message.userId === userId));
  }

  if (req.method === "POST" && pathname === "/api/chat") {
    const session = requireUser(req, res, db);
    if (!session) return;
    const body = await readBody(req);
    const text = String(body.text || "").trim();
    if (!text) return sendError(res, 400, "Message cannot be empty.");
    const targetUserId = session.user.role === "admin" ? Number(body.userId) : session.user.id;
    if (!db.users.some((user) => user.id === targetUserId)) return sendError(res, 404, "Customer not found.");
    const message = {
      id: nextId(db.messages),
      userId: targetUserId,
      senderId: session.user.id,
      senderName: session.user.name,
      senderRole: session.user.role,
      text,
      createdAt: now()
    };
    db.messages.push(message);
    writeDb(db);
    return sendJson(res, 201, message);
  }

  return sendError(res, 404, "API route not found.");
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const filePath = path.normalize(path.join(ROOT, safePath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      return res.end("Not found");
    }
    res.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}

seedAdmin();

const app = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url.pathname);
    return serveStatic(req, res, url.pathname);
  } catch (error) {
    return sendError(res, 500, error.message || "Server error.");
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Himo online server running at http://localhost:${PORT}`);
    console.log("Admin login: admin@himo.local / admin123");
  });
}

module.exports = app;
