const app = require("./server");
const fs = require("fs");
const path = require("path");

const PORT = 3137;
const base = `http://localhost:${PORT}`;
const dbPath = path.join(__dirname, "db.json");
const dbSnapshot = fs.readFileSync(dbPath, "utf8");

function request(path, options = {}) {
  return fetch(`${base}${path}`, options);
}

function cookieFrom(response) {
  return response.headers.get("set-cookie").split(";")[0];
}

async function json(response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

const server = app.listen(PORT, async () => {
  try {
    const home = await request("/");
    if (home.status !== 200) throw new Error("Home page did not load.");

    const products = await json(await request("/api/products"));
    if (!Array.isArray(products) || products.length < 1) throw new Error("Products API returned no products.");

    const adminLogin = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@himo.local", password: "admin123" })
    });
    const adminCookie = cookieFrom(adminLogin);
    const orders = await json(await request("/api/orders", { headers: { Cookie: adminCookie } }));
    if (!Array.isArray(orders)) throw new Error("Admin orders API did not return a list.");

    const email = `test${Date.now()}@himo.local`;
    const customerLogin = await request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test Customer", email, password: "secret123" })
    });
    const customerCookie = cookieFrom(customerLogin);
    const order = await json(await request("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ items: [{ id: products[0].id, quantity: 1 }] })
    }));
    if (!order.id) throw new Error("Order was not created.");

    const message = await json(await request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ text: "Hello support" })
    }));
    if (!message.id) throw new Error("Chat message was not created.");

    console.log("Smoke test passed");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(dbPath, dbSnapshot);
    server.close();
  }
});
