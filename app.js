let products = [];

const state = {
  cart: JSON.parse(localStorage.getItem("himo-online-cart") || "[]"),
  query: "",
  category: "all",
  maxPrice: 150,
  sort: "featured",
  user: null
};

const productGrid = document.querySelector("#productGrid");
const resultCount = document.querySelector("#resultCount");
const cartCount = document.querySelector("#cartCount");
const cartDrawer = document.querySelector("#cartDrawer");
const cartItems = document.querySelector("#cartItems");
const overlay = document.querySelector("#overlay");
const toast = document.querySelector("#toast");
const modal = document.querySelector("#productModal");
const modalContent = document.querySelector("#modalContent");
const authModal = document.querySelector("#authModal");
const authForms = document.querySelectorAll(".auth-form");
const userLabel = document.querySelector("#userLabel");
const authButton = document.querySelector("#authButton");
const logoutButton = document.querySelector("#logoutButton");
const chatPanel = document.querySelector("#chatPanel");
const chatMessages = document.querySelector("#chatMessages");
chatPanel.hidden = true;

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function saveCart() {
  localStorage.setItem("himo-online-cart", JSON.stringify(state.cart));
}

function filteredProducts() {
  const query = state.query.trim().toLowerCase();
  const filtered = products.filter((product) => {
    const matchesQuery = !query || `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(query);
    const matchesCategory = state.category === "all" || product.category === state.category;
    const matchesPrice = product.price <= state.maxPrice;
    return matchesQuery && matchesCategory && matchesPrice;
  });

  return filtered.sort((a, b) => {
    if (state.sort === "price-low") return a.price - b.price;
    if (state.sort === "price-high") return b.price - a.price;
    if (state.sort === "rating") return b.rating - a.rating;
    return a.id - b.id;
  });
}

function syncCategories() {
  const categoryFilter = document.querySelector("#categoryFilter");
  const current = categoryFilter.value;
  const categories = [...new Set(products.map((product) => product.category))].sort();
  categoryFilter.innerHTML = `<option value="all">All categories</option>${categories.map((category) => `<option value="${category}">${category}</option>`).join("")}`;
  categoryFilter.value = categories.includes(current) ? current : "all";
}

function syncPriceRange() {
  const priceFilter = document.querySelector("#priceFilter");
  const max = Math.max(150, ...products.map((product) => Number(product.price) || 0));
  priceFilter.max = String(max);
  if (state.maxPrice > max || state.maxPrice === 150) state.maxPrice = max;
  priceFilter.value = String(state.maxPrice);
  document.querySelector("#priceLabel").textContent = money.format(state.maxPrice).replace(".00", "");
}

function renderProducts() {
  const visible = filteredProducts();
  resultCount.textContent = `${visible.length} product${visible.length === 1 ? "" : "s"}`;

  if (!visible.length) {
    productGrid.innerHTML = `<p class="empty-state">No products match your filters.</p>`;
    return;
  }

  productGrid.innerHTML = visible.map((product) => `
    <article class="product-card">
      <button class="product-art" type="button" data-view="${product.id}" aria-label="View ${product.name}">
        <img src="${product.image}" alt="${product.name}" />
      </button>
      <div class="product-info">
        <div class="product-topline">
          <span class="category-pill">${product.category}</span>
          <span class="rating">Star ${product.rating}</span>
        </div>
        <h3>${product.name}</h3>
        <p>${product.description}</p>
        <div class="stock-line">${product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}</div>
        <div class="product-actions">
          <span class="price">${money.format(product.price)}</span>
          <button class="small-button" type="button" data-add="${product.id}" ${product.stock <= 0 ? "disabled" : ""}>Add</button>
        </div>
      </div>
    </article>
  `).join("");
}

async function loadProducts() {
  products = await api("/api/products");
  syncCategories();
  syncPriceRange();
  renderProducts();
  renderCart();
}

function addToCart(productId, quantity = 1) {
  const product = products.find((candidate) => candidate.id === productId);
  if (!product || product.stock <= 0) {
    showToast("This item is out of stock");
    return;
  }
  const item = state.cart.find((cartItem) => cartItem.id === productId);
  const currentQuantity = item ? item.quantity : 0;
  if (currentQuantity + quantity > product.stock) {
    showToast("No more stock available");
    return;
  }
  if (item) {
    item.quantity += quantity;
  } else {
    state.cart.push({ id: productId, quantity });
  }
  saveCart();
  renderCart();
  showToast("Added to cart");
}

function updateQuantity(productId, delta) {
  const item = state.cart.find((cartItem) => cartItem.id === productId);
  const product = products.find((candidate) => candidate.id === productId);
  if (!item || !product) return;
  if (delta > 0 && item.quantity >= product.stock) {
    showToast("No more stock available");
    return;
  }
  item.quantity += delta;
  if (item.quantity <= 0) {
    state.cart = state.cart.filter((cartItem) => cartItem.id !== productId);
  }
  saveCart();
  renderCart();
}

function cartTotals() {
  const subtotal = state.cart.reduce((sum, item) => {
    const product = products.find((candidate) => candidate.id === item.id);
    return product ? sum + product.price * item.quantity : sum;
  }, 0);
  const units = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const discount = units >= 3 ? subtotal * 0.2 : 0;
  const delivery = subtotal - discount >= 60 || subtotal === 0 ? 0 : 8;
  return { subtotal, discount, delivery, total: subtotal - discount + delivery, units };
}

function renderCart() {
  const totals = cartTotals();
  cartCount.textContent = totals.units;

  if (!state.cart.length) {
    cartItems.innerHTML = `<p class="empty-state">Your cart is empty.</p>`;
  } else {
    cartItems.innerHTML = state.cart.map((item) => {
      const product = products.find((candidate) => candidate.id === item.id);
      if (!product) return "";
      return `
        <div class="cart-item">
          <img src="${product.image}" alt="${product.name}" />
          <div>
            <h3>${product.name}</h3>
            <div class="cart-line">
              <span>${money.format(product.price)}</span>
              <div class="quantity" aria-label="Quantity for ${product.name}">
                <button type="button" data-qty="${product.id}" data-delta="-1" aria-label="Decrease quantity">-</button>
                <strong>${item.quantity}</strong>
                <button type="button" data-qty="${product.id}" data-delta="1" aria-label="Increase quantity">+</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  document.querySelector("#subtotal").textContent = money.format(totals.subtotal);
  document.querySelector("#discount").textContent = `-${money.format(totals.discount)}`;
  document.querySelector("#delivery").textContent = totals.delivery ? money.format(totals.delivery) : "Free";
  document.querySelector("#total").textContent = money.format(totals.total);
}

function openCart() {
  overlay.hidden = false;
  cartDrawer.classList.add("open");
  cartDrawer.setAttribute("aria-hidden", "false");
}

function closeCart() {
  overlay.hidden = true;
  cartDrawer.classList.remove("open");
  cartDrawer.setAttribute("aria-hidden", "true");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function showProduct(productId) {
  const product = products.find((candidate) => candidate.id === productId);
  modalContent.innerHTML = `
    <div class="modal-body">
      <img src="${product.image}" alt="${product.name}" />
      <div class="modal-copy">
        <span class="category-pill">${product.category}</span>
        <h2>${product.name}</h2>
        <span class="rating">Star ${product.rating} customer rating</span>
        <p>${product.description}</p>
        <span class="stock-line">${product.stock} in stock</span>
        <strong class="price">${money.format(product.price)}</strong>
        <div class="modal-actions">
          <button class="primary-action" type="button" data-add="${product.id}" ${product.stock <= 0 ? "disabled" : ""}>Add to cart</button>
          <button class="small-button" type="button" id="modalCartButton">View cart</button>
        </div>
      </div>
    </div>
  `;
  modal.showModal();
}

function setUser(user) {
  state.user = user;
  userLabel.textContent = user ? `Hi, ${user.name}` : "Guest";
  authButton.hidden = Boolean(user);
  logoutButton.hidden = !user;
  document.querySelector("#adminLink").hidden = !user || user.role !== "admin";
}

async function loadMe() {
  const data = await api("/api/auth/me");
  setUser(data.user);
}

function openAuth(mode = "login") {
  authModal.showModal();
  document.querySelectorAll(".auth-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.authTab === mode);
  });
  authForms.forEach((form) => {
    form.hidden = form.dataset.authForm !== mode;
  });
}

async function submitOrder() {
  if (!state.cart.length) {
    showToast("Add products before checkout");
    return;
  }
  if (!state.user) {
    openAuth("login");
    showToast("Please log in or register first");
    return;
  }
  const order = await api("/api/orders", {
    method: "POST",
    body: JSON.stringify({ items: state.cart })
  });
  state.cart = [];
  saveCart();
  await loadProducts();
  closeCart();
  showToast(`Order #${order.id} created`);
}

async function loadChat() {
  if (!state.user) {
    chatMessages.innerHTML = `<p class="empty-state">Log in to chat with support.</p>`;
    return;
  }
  const messages = await api("/api/chat");
  chatMessages.innerHTML = messages.length ? messages.map((message) => `
    <div class="message ${message.senderRole === "admin" ? "from-admin" : "from-customer"}">
      <strong>${message.senderName}</strong>
      <p>${message.text}</p>
      <span>${new Date(message.createdAt).toLocaleString()}</span>
    </div>
  `).join("") : `<p class="empty-state">No messages yet.</p>`;
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

document.querySelector("#searchInput").addEventListener("input", (event) => {
  state.query = event.target.value;
  renderProducts();
});

document.querySelector("#categoryFilter").addEventListener("change", (event) => {
  state.category = event.target.value;
  renderProducts();
});

document.querySelector("#priceFilter").addEventListener("input", (event) => {
  state.maxPrice = Number(event.target.value);
  document.querySelector("#priceLabel").textContent = money.format(state.maxPrice).replace(".00", "");
  renderProducts();
});

document.querySelector("#sortFilter").addEventListener("change", (event) => {
  state.sort = event.target.value;
  renderProducts();
});

document.querySelector("#resetFilters").addEventListener("click", () => {
  state.query = "";
  state.category = "all";
  state.maxPrice = Number(document.querySelector("#priceFilter").max);
  state.sort = "featured";
  document.querySelector("#searchInput").value = "";
  document.querySelector("#categoryFilter").value = "all";
  document.querySelector("#priceFilter").value = state.maxPrice;
  document.querySelector("#priceLabel").textContent = money.format(state.maxPrice).replace(".00", "");
  document.querySelector("#sortFilter").value = "featured";
  renderProducts();
});

document.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add]");
  const viewButton = event.target.closest("[data-view]");
  const quantityButton = event.target.closest("[data-qty]");

  if (addButton) addToCart(Number(addButton.dataset.add));
  if (viewButton) showProduct(Number(viewButton.dataset.view));
  if (quantityButton) updateQuantity(Number(quantityButton.dataset.qty), Number(quantityButton.dataset.delta));
  if (event.target.id === "modalCartButton") {
    modal.close();
    openCart();
  }
});

document.querySelector("#openCart").addEventListener("click", openCart);
document.querySelector("#closeCart").addEventListener("click", closeCart);
overlay.addEventListener("click", closeCart);
document.querySelector("#closeModal").addEventListener("click", () => modal.close());
document.querySelector("#checkoutButton").addEventListener("click", () => submitOrder().catch((error) => showToast(error.message)));
document.querySelector("#authButton").addEventListener("click", () => openAuth("login"));
document.querySelector("#closeAuth").addEventListener("click", () => authModal.close());
document.querySelector("#openChat").addEventListener("click", async () => {
  chatPanel.hidden = !chatPanel.hidden;
  if (!chatPanel.hidden) await loadChat().catch((error) => showToast(error.message));
});
document.querySelector("#closeChat").addEventListener("click", () => {
  chatPanel.hidden = true;
});

document.querySelectorAll(".auth-tab").forEach((button) => {
  button.addEventListener("click", () => openAuth(button.dataset.authTab));
});

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const user = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form))
    });
    setUser(user);
    authModal.close();
    showToast("Logged in");
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const user = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form))
    });
    setUser(user);
    authModal.close();
    event.currentTarget.reset();
    showToast("Account created");
  } catch (error) {
    showToast(error.message);
  }
});

logoutButton.addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  setUser(null);
  chatPanel.hidden = true;
  showToast("Logged out");
});

document.querySelector("#chatForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.user) {
    openAuth("login");
    return;
  }
  const form = new FormData(event.currentTarget);
  try {
    await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({ text: form.get("text") })
    });
    event.currentTarget.reset();
    await loadChat();
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#bundleButton").addEventListener("click", () => {
  [1, 2, 3].forEach((id) => addToCart(id));
  openCart();
  showToast("Bundle discount applied");
});

document.querySelector("#newsletterForm").addEventListener("submit", (event) => {
  event.preventDefault();
  event.currentTarget.reset();
  showToast("Thanks for subscribing");
});

document.querySelector("#themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("dark");
  localStorage.setItem("himo-online-theme", document.body.classList.contains("dark") ? "dark" : "light");
});

if (localStorage.getItem("himo-online-theme") === "dark") {
  document.body.classList.add("dark");
}

Promise.all([loadProducts(), loadMe()]).catch((error) => {
  showToast(error.message);
  productGrid.innerHTML = `<p class="empty-state">Start the server with node server.js to load products.</p>`;
});
