// login.js — logic for the OTP login/signup page
const phoneForm = document.getElementById('phone-form');
const codeForm = document.getElementById('code-form');
const errorBox = document.getElementById('error-box');
const successBox = document.getElementById('success-box');
let currentPhone = '';

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.add('visible');
  successBox.classList.remove('visible');
}
function showSuccess(message) {
  successBox.textContent = message;
  successBox.classList.add('visible');
  errorBox.classList.remove('visible');
}
function clearMessages() {
  errorBox.classList.remove('visible');
  successBox.classList.remove('visible');
}

phoneForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessages();
  currentPhone = document.getElementById('phone').value.trim();
  const btn = document.getElementById('request-otp-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> در حال ارسال...';

  try {
    const data = await apiRequest('/auth/request-otp', {
      method: 'POST',
      body: { phone: currentPhone },
    });
    showSuccess(data.message || 'کد ارسال شد.');
    phoneForm.style.display = 'none';
    codeForm.style.display = 'block';
    if (data.devOnlyCode) {
      document.getElementById('code').value = data.devOnlyCode;
      // DEV-ONLY convenience: since the code is already known (mocked
      // SMS), auto-submit after a short delay instead of making you
      // click "تأیید و ورود" yourself. The delay (rather than an
      // instant submit) leaves a brief window to type a name if this
      // is your first time signing up with this number — in
      // production there is no devOnlyCode, so this whole branch
      // never runs and the user always enters the real code manually.
      showSuccess((data.message || 'کد ارسال شد.') + ' (به‌صورت خودکار در حال ورود...)');
      setTimeout(() => {
        if (codeForm.style.display !== 'none') {
          codeForm.requestSubmit();
        }
      }, 1500);
    }
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'دریافت کد تأیید';
  }
});

codeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessages();
  const code = document.getElementById('code').value.trim();
  const name = document.getElementById('name').value.trim();

  try {
    const data = await apiRequest('/auth/verify-otp', {
      method: 'POST',
      body: { phone: currentPhone, code, name: name || undefined },
    });
    storeUser(data.user);
    window.location.href = '/bags.html';
  } catch (err) {
    showError(err.message);
  }
});

document.getElementById('back-btn').addEventListener('click', () => {
  codeForm.style.display = 'none';
  phoneForm.style.display = 'block';
  clearMessages();
});
