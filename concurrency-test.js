// concurrency-test.js
// Fires 5 simultaneous reservation requests for a bag that only has
// 3 units available, and confirms EXACTLY 3 succeed and 2 fail with 409.
//
// Usage:
//   1. Create a bag with quantityAvailable: 3 (as the business owner)
//   2. Get a customer cookie (not the owner!) — save it as customer-cookies.txt
//   3. node concurrency-test.js <bagId> <path-to-customer-cookies.txt>

const fs = require('fs');

const bagId = process.argv[2];
const cookiePath = process.argv[3];

if (!bagId || !cookiePath) {
  console.error('Usage: node concurrency-test.js <bagId> <cookieFilePath>');
  process.exit(1);
}

// Extract the jwt value straight out of a Netscape-format cookie file
// (the same file curl's -c flag produces)
const cookieFileContent = fs.readFileSync(cookiePath, 'utf-8');
const jwtLine = cookieFileContent.split('\n').find((line) => line.includes('\tjwt\t'));
const jwt = jwtLine.trim().split('\t').pop();

const fireReservation = async (i) => {
  const res = await fetch('http://localhost:3000/api/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `jwt=${jwt}`,
    },
    body: JSON.stringify({ surpriseBag: bagId, quantity: 1 }),
  });
  const body = await res.json();
  console.log(`Request ${i}: status ${res.status} — ${body.status}${body.message ? ' — ' + body.message : ''}`);
  return res.status;
};

(async () => {
  const results = await Promise.all([1, 2, 3, 4, 5].map(fireReservation));
  const successCount = results.filter((s) => s === 201).length;
  console.log(`\n${successCount} out of 5 requests succeeded (expected: exactly 3, matching quantityAvailable).`);
})();
