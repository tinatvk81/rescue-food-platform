// bag-detail.js — logic for the single-bag detail + reserve page
const params = new URLSearchParams(window.location.search);
const bagId = params.get('id');
const contentEl = document.getElementById('content');

function renderBag(bag) {
  contentEl.innerHTML = `
    <div class="card">
      <p class="bag-card-business">${bag.business.name} — ${bag.business.address}</p>
      <h1 class="section-title" style="margin-bottom: 10px;">${bag.title}</h1>
      ${bag.description ? `<p>${bag.description}</p>` : ''}
      <div class="price-row" style="margin: 16px 0;">
        <span class="price-original">${formatToman(bag.originalPrice)}</span>
        <span class="price-discounted" style="font-size: 1.3rem;">${formatToman(bag.discountedPrice)} تومان</span>
      </div>
      <p style="font-size: 0.9rem; color: var(--color-ink-soft);">
        بازه تحویل: ${new Date(bag.pickupWindowStart).toLocaleString('fa-IR')} تا
        ${new Date(bag.pickupWindowEnd).toLocaleString('fa-IR')}
      </p>
      <span class="badge badge-${bag.status.toLowerCase()}">${bag.status}</span>
    </div>

    <div class="form-error" id="error-box"></div>

    <div class="card">
      <div class="field">
        <label for="quantity">تعداد</label>
        <input type="number" id="quantity" value="1" min="1" max="${bag.quantityAvailable - bag.quantityReserved}" />
      </div>
      <button class="btn btn-accent btn-block" id="reserve-btn">رزرو و پرداخت</button>
    </div>
  `;

  document.getElementById('reserve-btn').addEventListener('click', () => reserveBag(bag));
}

async function reserveBag(bag) {
  const user = getStoredUser();
  if (!user) {
    window.location.href = '/login.html';
    return;
  }

  const errorBox = document.getElementById('error-box');
  errorBox.classList.remove('visible');

  const quantity = Number(document.getElementById('quantity').value);
  const btn = document.getElementById('reserve-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> در حال رزرو...';

  try {
    const orderData = await apiRequest('/orders', {
      method: 'POST',
      body: { surpriseBag: bag._id, quantity },
    });

    const payData = await apiRequest(`/orders/${orderData.order._id}/pay`, {
      method: 'POST',
    });

    window.location.href = payData.paymentUrl;
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.classList.add('visible');
    btn.disabled = false;
    btn.textContent = 'رزرو و پرداخت';
  }
}

async function init() {
  if (!bagId) {
    contentEl.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><p>شناسه بسته مشخص نیست.</p></div>';
    return;
  }
  try {
    const data = await apiRequest(`/bags/${bagId}`);
    renderBag(data.bag);
  } catch (err) {
    contentEl.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${err.message}</p></div>`;
  }
}

init();
