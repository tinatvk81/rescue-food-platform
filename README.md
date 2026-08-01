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
