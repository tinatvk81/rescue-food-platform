// index.js — logic for the landing page
const user = getStoredUser();
if (user) {
  const authLink = document.getElementById('nav-auth-link');
  authLink.textContent = `سلام ${user.name}`;
  authLink.href = '/orders.html';
}
