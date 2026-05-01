const state = {
  user: null,
  products: [],
  orders: [],
  customers: [],
  selectedCustomerId: null
};

const toast = document.querySelector("#toast");
const loginPanel = document.querySelector("#loginPanel");
const workspace = document.querySelector("#adminWorkspace");
const productForm = document.querySelector("#productForm");
const adminProducts = document.querySelector("#adminProducts");
const adminOrders = document.querySelector("#adminOrders");
const customerList = document.querySelector("#customerList");
const adminChatMessages = document.querySelector("#adminChatMessages");
const productImagePreview = document.querySelector("#productImagePreview");

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

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function setWorkspace(visible) {
  loginPanel.hidden = visible;
  workspace.hidden = !visible;
}

function renderMetrics() {
  const revenue = state.orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  document.querySelector("#adminMetrics").innerHTML = `
    <div><strong>${state.products.length}</strong><span>Products</span></div>
    <div><strong>${state.orders.length}</strong><span>Orders</span></div>
    <div><strong>${money.format(revenue)}</strong><span>Revenue</span></div>
  `;
}

function renderProducts() {
  adminProducts.innerHTML = state.products.map((product) => `
    <article class="admin-card">
      <img src="${product.image}" alt="${product.name}" />
      <div>
        <strong>${product.name}</strong>
        <span>${product.category} - ${money.format(product.price)} - ${product.stock} stock</span>
        <p>${product.description}</p>
      </div>
      <div class="row-actions">
        <button class="small-button" type="button" data-edit-product="${product.id}">Edit</button>
        <button class="small-button danger-button" type="button" data-delete-product="${product.id}">Delete</button>
      </div>
    </article>
  `).join("");
}

function renderOrders() {
  adminOrders.innerHTML = state.orders.length ? state.orders.map((order) => `
    <article class="admin-card order-card">
      <div>
        <strong>Order #${order.id} - ${order.customerName}</strong>
        <span>${order.customerEmail} - ${new Date(order.createdAt).toLocaleString()}</span>
        <p>${order.items.map((item) => `${item.quantity}x ${item.name}`).join(", ")}</p>
      </div>
      <div class="order-controls">
        <strong>${money.format(order.total)}</strong>
        <select data-order-status="${order.id}" aria-label="Order status">
          ${["New", "Processing", "Shipped", "Completed", "Cancelled"].map((status) => `<option value="${status}" ${order.status === status ? "selected" : ""}>${status}</option>`).join("")}
        </select>
      </div>
    </article>
  `).join("") : `<p class="empty-state">No orders yet.</p>`;
}

function renderCustomers() {
  customerList.innerHTML = state.customers.length ? state.customers.map((customer) => `
    <button class="customer-button ${customer.id === state.selectedCustomerId ? "active" : ""}" type="button" data-customer="${customer.id}">
      <strong>${customer.name}</strong>
      <span>${customer.email}</span>
    </button>
  `).join("") : `<p class="empty-state">No customers yet.</p>`;
}

async function loadChat() {
  if (!state.selectedCustomerId) {
    adminChatMessages.innerHTML = `<p class="empty-state">Select a customer.</p>`;
    return;
  }
  const messages = await api(`/api/chat?userId=${state.selectedCustomerId}`);
  adminChatMessages.innerHTML = messages.length ? messages.map((message) => `
    <div class="message ${message.senderRole === "admin" ? "from-admin" : "from-customer"}">
      <strong>${message.senderName}</strong>
      <p>${message.text}</p>
      <span>${new Date(message.createdAt).toLocaleString()}</span>
    </div>
  `).join("") : `<p class="empty-state">No messages yet.</p>`;
  adminChatMessages.scrollTop = adminChatMessages.scrollHeight;
}

async function loadAdminData() {
  const [products, orders, customers] = await Promise.all([
    api("/api/products"),
    api("/api/orders"),
    api("/api/admin/users")
  ]);
  state.products = products;
  state.orders = orders;
  state.customers = customers;
  if (!state.selectedCustomerId && customers.length) state.selectedCustomerId = customers[0].id;
  renderMetrics();
  renderProducts();
  renderOrders();
  renderCustomers();
  await loadChat();
}

function fillProductForm(product) {
  productForm.elements.id.value = product.id || "";
  productForm.elements.name.value = product.name || "";
  productForm.elements.category.value = product.category || "";
  productForm.elements.price.value = product.price || "";
  productForm.elements.rating.value = product.rating || 4.5;
  productForm.elements.stock.value = product.stock || 0;
  productForm.elements.image.value = product.image || "assets/product-tote.svg";
  renderImagePreview(product.image || "");
  productForm.elements.description.value = product.description || "";
  productForm.elements.name.focus();
}

function renderImagePreview(src) {
  productImagePreview.innerHTML = src ? `<img src="${src}" alt="Selected product preview" />` : `<span>No image selected</span>`;
}

async function init() {
  const me = await api("/api/auth/me");
  state.user = me.user;
  if (!state.user || state.user.role !== "admin") {
    setWorkspace(false);
    return;
  }
  setWorkspace(true);
  await loadAdminData();
}

document.querySelector("#adminLoginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const user = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form))
    });
    if (user.role !== "admin") throw new Error("This account is not an admin.");
    state.user = user;
    setWorkspace(true);
    await loadAdminData();
    showToast("Welcome back");
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#adminLogout").addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  setWorkspace(false);
  showToast("Logged out");
});

productForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(productForm));
  const id = body.id;
  delete body.id;
  delete body.imageFile;
  try {
    await api(id ? `/api/admin/products/${id}` : "/api/admin/products", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(body)
    });
    productForm.reset();
    await loadAdminData();
    showToast("Product saved");
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#clearProductForm").addEventListener("click", () => {
  productForm.reset();
  productForm.elements.id.value = "";
  renderImagePreview("");
});

productForm.elements.image.addEventListener("input", (event) => {
  renderImagePreview(event.target.value);
});

productForm.elements.imageFile.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("Please choose an image file");
    event.target.value = "";
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    productForm.elements.image.value = reader.result;
    renderImagePreview(reader.result);
    showToast("Image ready to save");
  });
  reader.readAsDataURL(file);
});

document.addEventListener("click", async (event) => {
  const editButton = event.target.closest("[data-edit-product]");
  const deleteButton = event.target.closest("[data-delete-product]");
  const customerButton = event.target.closest("[data-customer]");

  if (editButton) {
    const product = state.products.find((item) => item.id === Number(editButton.dataset.editProduct));
    fillProductForm(product);
  }

  if (deleteButton) {
    const id = Number(deleteButton.dataset.deleteProduct);
    try {
      await api(`/api/admin/products/${id}`, { method: "DELETE" });
      await loadAdminData();
      showToast("Product deleted");
    } catch (error) {
      showToast(error.message);
    }
  }

  if (customerButton) {
    state.selectedCustomerId = Number(customerButton.dataset.customer);
    renderCustomers();
    await loadChat().catch((error) => showToast(error.message));
  }
});

document.addEventListener("change", async (event) => {
  const statusSelect = event.target.closest("[data-order-status]");
  if (!statusSelect) return;
  try {
    await api(`/api/orders/${statusSelect.dataset.orderStatus}`, {
      method: "PATCH",
      body: JSON.stringify({ status: statusSelect.value })
    });
    await loadAdminData();
    showToast("Order updated");
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#adminChatForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.selectedCustomerId) {
    showToast("Select a customer first");
    return;
  }
  const form = new FormData(event.currentTarget);
  try {
    await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({ userId: state.selectedCustomerId, text: form.get("text") })
    });
    event.currentTarget.reset();
    await loadChat();
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#changePasswordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const newPassword = String(form.get("newPassword") || "");
  const confirmPassword = String(form.get("confirmPassword") || "");
  if (newPassword !== confirmPassword) {
    showToast("New passwords do not match");
    return;
  }
  try {
    await api("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({
        currentPassword: form.get("currentPassword"),
        newPassword
      })
    });
    event.currentTarget.reset();
    showToast("Password updated");
  } catch (error) {
    showToast(error.message);
  }
});

init().catch((error) => {
  setWorkspace(false);
  showToast(error.message);
});

renderImagePreview("");
