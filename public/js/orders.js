// orders.js — logic for the "my orders" page
const contentEl = document.getElementById('content');

const STATUS_LABELS = {
  reserved: 'رزرو‌شده',
  pickedUp: 'تحویل گرفته‌شده',
  noShow: 'عدم‌مراجعه',
  cancelled: 'لغوشده',
};

function renderOrders(orders) {
  if (orders.length === 0) {
    contentEl.innerHTML = `
      <div class="empty-state">
        <div class="icon">🧾</div>
        <p>هنوز سفارشی ثبت نکردی.</p>
        <a href="/bags.html" class="btn btn-accent" style="margin-top: 12px;">دیدن بسته‌های نزدیک</a>
      </div>
    `;
    return;
  }

  contentEl.innerHTML = orders
    .map((order) => {
      const bagTitle = order.surpriseBag ? order.surpriseBag.title : 'بسته حذف‌شده';
      const canReview = order.status === 'pickedUp';
      const canCancel = order.status === 'reserved';
      const canPay = order.status === 'reserved' && order.paymentStatus !== 'paid';

      return `
        <div class="card" data-order-id="${order._id}">
          <p class="bag-card-business">${bagTitle}</p>
          <div style="display:flex; justify-content:space-between; align-items:center; margin: 10px 0;">
            <span class="badge badge-${order.status.toLowerCase()}">${STATUS_LABELS[order.status] || order.status}</span>
            <span class="price-discounted">${formatToman(order.totalPrice)} تومان</span>
          </div>
          ${
            order.paymentStatus === 'paid'
              ? `<p style="font-family: var(--font-mono); font-size: 1.1rem; text-align:center; background: var(--color-accent-soft); border-radius: var(--radius-sm); padding: 10px; letter-spacing: 2px;">${order.pickupCode}</p>`
              : ''
          }
          <div style="display:flex; gap:8px; margin-top: 12px;">
            ${canPay ? `<button class="btn btn-primary pay-btn">پرداخت</button>` : ''}
            ${canCancel ? `<button class="btn btn-outline cancel-btn">لغو رزرو</button>` : ''}
            ${canReview ? `<button class="btn btn-outline review-btn">ثبت امتیاز</button>` : ''}
          </div>
        </div>
      `;
    })
    .join('');

  document.querySelectorAll('.pay-btn').forEach((btn) =>
    btn.addEventListener('click', (e) => payOrder(e.target.closest('.card').dataset.orderId))
  );
  document.querySelectorAll('.cancel-btn').forEach((btn) =>
    btn.addEventListener('click', (e) => cancelOrder(e.target.closest('.card').dataset.orderId))
  );
  document.querySelectorAll('.review-btn').forEach((btn) =>
    btn.addEventListener('click', (e) => reviewOrder(e.target.closest('.card').dataset.orderId))
  );
}

async function payOrder(orderId) {
  try {
    const data = await apiRequest(`/orders/${orderId}/pay`, { method: 'POST' });
    window.location.href = data.paymentUrl;
  } catch (err) {
    alert(err.message);
  }
}

async function cancelOrder(orderId) {
  if (!confirm('مطمئنی می‌خوای این رزرو رو لغو کنی؟')) return;
  try {
    await apiRequest(`/orders/${orderId}/cancel`, { method: 'PATCH' });
    loadOrders();
  } catch (err) {
    alert(err.message);
  }
}

async function reviewOrder(orderId) {
  const rating = prompt('امتیاز خودت رو از ۱ تا ۵ وارد کن:');
  if (!rating) return;
  const comment = prompt('نظرت رو بنویس (اختیاری):') || undefined;
  try {
    await apiRequest(`/orders/${orderId}/review`, {
      method: 'POST',
      body: { rating: Number(rating), comment },
    });
    alert('ممنون از نظرت! ✅');
  } catch (err) {
    alert(err.message);
  }
}

async function loadOrders() {
  const user = getStoredUser();
  if (!user) {
    window.location.href = '/login.html';
    return;
  }
  try {
    const data = await apiRequest('/orders/my-orders');
    renderOrders(data.orders);
  } catch (err) {
    contentEl.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${err.message}</p></div>`;
  }
}

loadOrders();
