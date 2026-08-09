// bags.js — logic for the nearby-bags list page
const resultsEl = document.getElementById('results');
const sortSelect = document.getElementById('sort-select');

function renderLoading() {
  resultsEl.innerHTML = '<div class="empty-state"><span class="spinner"></span><p>در حال پیدا کردن موقعیت و بسته‌ها...</p></div>';
}

function renderError(message) {
  resultsEl.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${message}</p></div>`;
}

function renderEmpty() {
  resultsEl.innerHTML = '<div class="empty-state"><div class="icon">🍽️</div><p>فعلاً بسته‌ی فعالی نزدیک تو پیدا نشد. بعداً دوباره سر بزن.</p></div>';
}

function renderBags(bags) {
  if (bags.length === 0) {
    renderEmpty();
    return;
  }
  resultsEl.innerHTML = bags
    .map((bag) => {
      const urgent = bag.timeRemainingSeconds < 3600;
      return `
        <a class="bag-card" href="/bag-detail.html?id=${bag._id}">
          <div class="bag-card-top">
            <div class="bag-card-thumb">🥖</div>
            <div class="bag-card-info">
              <p class="bag-card-business">${bag.business.name}</p>
              <p class="bag-card-title">${bag.title}</p>
              <div class="bag-card-meta">
                <span>📍 ${formatDistance(bag.distanceInMeters)}</span>
              </div>
            </div>
          </div>
          <div class="bag-card-perf"></div>
          <div class="bag-card-bottom">
            <div class="price-row">
              <span class="price-original">${formatToman(bag.originalPrice)}</span>
              <span class="price-discounted">${formatToman(bag.discountedPrice)} تومان</span>
            </div>
            <span class="time-chip ${urgent ? 'urgent' : ''}">${formatTimeRemaining(bag.timeRemainingSeconds)}</span>
          </div>
        </a>
      `;
    })
    .join('');
}

async function loadBags(lat, lng) {
  renderLoading();
  try {
    const sort = sortSelect.value;
    const data = await apiRequest(`/bags/nearby?lat=${lat}&lng=${lng}&sort=${sort}`);
    renderBags(data.bags);
  } catch (err) {
    renderError(err.message);
  }
}

function init() {
  if (!navigator.geolocation) {
    renderError('مرورگر شما از موقعیت‌یابی پشتیبانی نمی‌کند.');
    return;
  }
  renderLoading();
  navigator.geolocation.getCurrentPosition(
    (position) => {
      loadBags(position.coords.latitude, position.coords.longitude);
    },
    () => {
      renderError('برای دیدن بسته‌های نزدیک، اجازه‌ی دسترسی به موقعیت مکانی را بده.');
    }
  );
}

sortSelect.addEventListener('change', () => {
  navigator.geolocation.getCurrentPosition((position) => {
    loadBags(position.coords.latitude, position.coords.longitude);
  });
});

init();
