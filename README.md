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

## 📌 Project Roadmap
- [x] Step 0 — Project skeleton setup and health-check endpoint
- [x] Step 1 — User model and basic JWT authentication
- [x] Step 2 — OTP login
- [ ] Step 3 — Business model and approval flow
- [ ] Step 4 — Admin panel
- [ ] Step 5 — SurpriseBag model
- [ ] Step 6 — Geospatial (nearby) search
- [ ] Step 7 — Reservations and concurrent inventory handling
- [ ] Step 8 — Payment gateway integration
- [ ] Step 9 — In-person pickup with code verification
- [ ] Step 10 — Cron jobs (expiry and no-show handling)
- [ ] Step 11 — Reviews and two-way trust/flagging system
- [ ] Step 12 — Notifications
- [ ] Step 13-14 — Business and admin dashboards
- [ ] Step 15 — Security hardening
- [ ] Step 16 — Frontend HTML/CSS pages
- [ ] Step 17 — Testing
- [ ] Step 18 — Deployment

## ⚠️ Security Notes
- The `.env` file must **never** be committed (already excluded via `.gitignore`)
- Always generate a random, long `JWT_SECRET` for production
- Restrict MongoDB Atlas Network Access for production (not `0.0.0.0/0`)
- `POST /api/v1/auth/request-otp` returns a `devOnlyCode` field when `NODE_ENV !== 'production'`, purely so you can test the OTP flow without a real SMS provider. **This must be removed or NODE_ENV must be set to `production` before any real deployment**, or anyone could log in as anyone else without ever touching their phone.

## 📄 License
This project is developed for educational/learning purposes.