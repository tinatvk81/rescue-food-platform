# 🍱 Rescue Food Platform

A platform to fight food waste — restaurants, bakeries, and cafés list their end-of-day surplus food as discounted "surprise bags" (50-70% off), and users reserve and pick them up in person.

## 🎯 Why this project?
Unlike existing food delivery platforms (Snapp Food, Tapsi Food) that focus on full-price orders delivered to your door, this platform focuses on **rescuing surplus food** with **in-person pickup only** — a different business model with much lower setup cost (no delivery fleet needed) and a strong environmental motivation for users.

## 🛠️ Tech Stack
- **Backend:** Node.js, Express.js
- **Database:** MongoDB (Mongoose ODM)
- **Authentication:** JWT + httpOnly cookies
- **Frontend:** Vanilla HTML, CSS, JavaScript
- **Security:** Helmet, express-rate-limit, express-mongo-sanitize

## 📁 Project Structure
```
rescue-food-platform/
├── models/          # Mongoose schemas (User, Business, SurpriseBag, Order, ...)
├── controllers/     # Core logic for each endpoint
├── routes/          # Maps API endpoints to controllers
├── middlewares/     # Auth checks, error handling, validation
├── utils/           # Shared helper functions
├── public/          # Static frontend assets (HTML/CSS/JS)
│   ├── css/
│   ├── js/
│   └── images/
├── views/           # (Optional) Pug templates for server-side rendering
├── app.js           # Express configuration (middlewares, routes, error handling)
├── server.js        # App entry point (DB connection + server startup)
└── .env.example     # Example of required environment variables
```

## 🚀 Local Setup

### Prerequisites
- Node.js v18 or higher
- A [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) account (free tier) or a local MongoDB instance

### Installation
```bash
# Clone the repo
git clone https://github.com/<username>/rescue-food-platform.git
cd rescue-food-platform

# Install dependencies
npm install

# Create your .env file from the example
cp .env.example .env
```

Then open `.env` and fill in real values:
```env
NODE_ENV=development
PORT=3000
MONGO_URI=mongodb+srv://<username>:<password>@<cluster-url>/rescue-food-platform?retryWrites=true&w=majority
JWT_SECRET=<a long random secret string>
JWT_EXPIRES_IN=7d
```

### Run
```bash
npm run dev
```
Then open in your browser:
```
http://localhost:3000/api/v1/health
```
If you see `{"status":"success", ...}`, the server and database are connected successfully.

## 🔐 Authentication
Two ways to log in are supported:

1. **Password-based** (`/api/v1/auth/signup`, `/login`, `/logout`) — classic phone + password flow.
2. **OTP-based / passwordless** (`/api/v1/auth/request-otp`, `/verify-otp`) — a 5-digit code is sent by SMS (currently mocked, see `utils/smsService.js`) and expires after 2 minutes. Verifying the correct code logs the user in, automatically creating an account on first use. Requests are rate-limited to 3 per phone number per 10 minutes to control SMS costs.

Both methods issue the same JWT, delivered as a secure `httpOnly` cookie.

## 🏪 Businesses
Any logged-in user can register **one** business (`POST /api/v1/businesses`) — on success, their account role is automatically promoted from `customer` to `business`. New businesses start with `status: 'pending'` and cannot publish surprise bags until an admin approves them (Step 4). Owners can edit their own business (`PATCH /api/v1/businesses/:id`) and upload verification documents (`POST /api/v1/businesses/:id/documents`, via `multer`). Business details are publicly viewable (`GET /api/v1/businesses/:id`), but sensitive fields (`nationalId`, `economicCode`, `documents`) are hidden from anyone except the owner or an admin.

## 🛡️ Admin
All `/api/v1/admin/*` routes require `role: 'admin'`. Since there's no signup flow for admins (intentionally — admin accounts should never be self-service), you must promote a user manually (see "Creating the first admin" below). Admins can list businesses by status, and approve/reject/suspend them. Every status change automatically creates a `Notification` document for the business owner (in-app only for now — real SMS/push delivery arrives in Step 12).

### Creating the first admin
Connect to your MongoDB instance and run:
```js
db.users.updateOne({ phone: "09123456789" }, { $set: { role: "admin" } })
```
(Using `mongosh`: `sudo docker exec -it rescue-mongo mongosh rescue-food-platform --eval 'db.users.updateOne({phone:"09123456789"},{$set:{role:"admin"}})'`)

## 🎁 Surprise Bags
An **approved** business (see the Admin Panel section above) can publish surprise bags — `POST /api/v1/bags` reuses the `requireApprovedBusiness()` middleware built (unused) in Step 3, so unapproved/suspended businesses are blocked automatically. A bag can only be edited (`PATCH /api/v1/bags/:id`) or cancelled (`DELETE /api/v1/bags/:id`, a soft-delete that sets `status: 'cancelled'`) **before it has any reservations** — this protects customers from a business changing the price or pickup window after someone has already paid. Bags are publicly viewable (`GET /api/v1/bags/:id`, no login required).

## 📍 Nearby Search
`GET /api/v1/bags/nearby?lat=..&lng=..&radius=..&category=..&maxPrice=..&sort=..` finds active, available, not-yet-expired surprise bags near a point using a MongoDB aggregation pipeline (`$geoNear` on `Business.location`, then `$lookup` into `SurpriseBag`). Only bags belonging to **approved** businesses are ever returned.

- `lat`, `lng` — required
- `radius` — optional, in **meters** (default `5000`)
- `category` — optional filter
- `maxPrice` — optional, filters by `discountedPrice`
- `sort` — `distance` (default), `price`, or `expiring-soon`

Each result includes `distanceInMeters` and `timeRemainingSeconds` (time left until `pickupWindowEnd`).

## 🧾 Orders & Reservations
`POST /api/v1/orders` (body: `{ surpriseBag, quantity }`) reserves a quantity of a surprise bag using an atomic MongoDB `findOneAndUpdate` — the condition `quantityReserved + quantity <= quantityAvailable` is checked and the increment applied as a single indivisible database operation, which is what prevents overselling when multiple customers try to reserve the same bag at the same moment. A business owner cannot reserve a bag from their own business. Each order gets a unique 6-character `pickupCode` (used at pickup time in Step 9). `paymentStatus` starts as `pending`. If order creation fails after inventory was already reserved, the reservation is automatically rolled back.

## 💳 Payments & Cancellations
`POST /api/v1/orders/:id/pay` starts a Zarinpal payment (a widely-used Iranian payment gateway) and returns a `paymentUrl` to redirect the customer to. Zarinpal redirects back to `GET /api/v1/orders/:id/verify-payment`, which confirms the transaction and marks the order `paid`. **Runs against Zarinpal's public sandbox by default** (`ZARINPAL_SANDBOX=true`, no real merchant account needed to test the full flow — see `.env.example`).

Cancellation policy (`utils/refundPolicy.js`):
- `PATCH /api/v1/orders/:id/business-cancel` — a business can cancel any of its own orders, any time, always fully refunded.
- `PATCH /api/v1/orders/:id/cancel` — a customer can cancel only if it's **at least 30 minutes before the pickup window starts**; if allowed, fully refunded.
- No-show (customer never picks up) is **not** handled here — that's an automatic, unrefunded outcome applied by the Step 10 cron job.

⚠️ Zarinpal does not expose a simple public refund API for standard merchant accounts — a `refunded` paymentStatus here records that a refund is *owed*, but actually returning money to the customer's card currently requires the Zarinpal merchant dashboard.

## 📦 In-Person Pickup
`PATCH /api/v1/orders/:id/pickup` (business-only, body: `{ pickupCode }`) confirms the handoff at the counter. It requires `paymentStatus === 'paid'` and a matching `pickupCode` (compared case-insensitively). On success, the order becomes `pickedUp`, `pickedUpAt` is recorded, and the customer's personal impact stats (`totalMealsSaved`, `totalMoneySaved`, `estimatedCO2Saved`) are incremented, using a shared, reusable calculation in `utils/impactStats.js` (2.5kg CO2 saved per meal, a commonly-cited estimate).

## ⏰ Scheduled Jobs (Cron)
Two background jobs (`jobs/cronJobs.js`) run automatically every 5 minutes, starting only after the MongoDB connection is confirmed:
1. **Expire bags** — any `active` `SurpriseBag` whose `pickupWindowEnd` has passed becomes `expired`.
2. **Mark no-shows** — any still-`reserved` `Order` whose bag's pickup window has passed becomes `noShow`. Per the cancellation policy, no-shows are **never** refunded — `paymentStatus` is left untouched even if it was `paid`.

To test without waiting 5 real minutes, run the jobs immediately with:
```bash
node scripts/run-cron-now.js
```