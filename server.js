import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

/* =========================
   DATABASE
========================= */
mongoose.connect("mongodb://127.0.0.1:27017/pro_admin")
.then(() => console.log("MongoDB connected"));

/* =========================
   MODELS (IN ONE FILE)
========================= */
const User = mongoose.model("User", new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: { type: String, default: "user" },
  balance: { type: Number, default: 0 }
}));

const Transaction = mongoose.model("Transaction", new mongoose.Schema({
  userId: String,
  type: { type: String, enum: ["deposit", "withdraw"] },
  amount: Number,
  status: { type: String, default: "pending" }
}, { timestamps: true }));

/* =========================
   CONFIG
========================= */
const JWT_SECRET = "SUPER_SECRET_2026";
const ADMIN_SECRET = "ADMIN_CREATE_2026";

/* =========================
   AUTH MIDDLEWARE
========================= */
function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ msg: "No token" });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ msg: "Invalid token" });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ msg: "Admins only" });
  }
  next();
}

/* =========================
   REGISTER ADMIN
========================= */
app.post("/api/register-admin", async (req, res) => {
  const { name, email, password, secret } = req.body;

  if (secret !== ADMIN_SECRET)
    return res.status(403).json({ msg: "Wrong secret" });

  const hash = await bcrypt.hash(password, 10);

  await User.create({
    name,
    email,
    password: hash,
    role: "admin"
  });

  res.json({ msg: "Admin created" });
});

/* =========================
   LOGIN
========================= */
app.post("/api/login", async (req, res) => {
  const user = await User.findOne({ email: req.body.email });

  if (!user) return res.status(404).json({ msg: "User not found" });

  const ok = await bcrypt.compare(req.body.password, user.password);
  if (!ok) return res.status(400).json({ msg: "Wrong password" });

  const token = jwt.sign(
    { id: user._id, role: user.role },
    JWT_SECRET,
    { expiresIn: "1d" }
  );

  res.json({ token, role: user.role });
});

/* =========================
   CREATE TRANSACTION
========================= */
app.post("/api/transaction", auth, async (req, res) => {
  const trx = await Transaction.create({
    userId: req.user.id,
    type: req.body.type,
    amount: req.body.amount
  });

  res.json(trx);
});

/* =========================
   ADMIN DASHBOARD APIs
========================= */

// STATS
app.get("/api/admin/stats", auth, adminOnly, async (req, res) => {
  const users = await User.countDocuments();

  const deposits = await Transaction.find({ type: "deposit" });
  const totalDeposit = deposits.reduce((a, b) => a + b.amount, 0);

  res.json({ users, totalDeposit });
});

// USERS
app.get("/api/admin/users", auth, adminOnly, async (req, res) => {
  res.json(await User.find());
});

// TRANSACTIONS
app.get("/api/admin/transactions", auth, adminOnly, async (req, res) => {
  res.json(await Transaction.find().sort({ createdAt: -1 }));
});

// APPROVE TRANSACTION
app.put("/api/admin/approve/:id", auth, adminOnly, async (req, res) => {
  const trx = await Transaction.findById(req.params.id);

  if (!trx) return res.status(404).json({ msg: "Not found" });

  trx.status = "approved";
  await trx.save();

  res.json({ msg: "Approved", trx });
});

/* =========================
   FRONTEND (SINGLE PAGE DASHBOARD)
========================= */
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<title>PRO Admin Dashboard</title>
<style>
body { font-family: Arial; background:#0f0f0f; color:white; padding:20px; }
input, button { padding:10px; margin:5px; }
.card { background:#1e1e1e; padding:15px; margin:10px 0; border-radius:10px; }
button { cursor:pointer; }
</style>
</head>
<body>

<h2>🔥 PRO ADMIN DASHBOARD</h2>

<div class="card">
<h3>Login</h3>
<input id="email" placeholder="email"><br>
<input id="password" type="password" placeholder="password"><br>
<button onclick="login()">Login</button>
</div>

<div class="card">
<h3>Admin Panel</h3>

<button onclick="stats()">Load Stats</button>
<button onclick="users()">Load Users</button>
<button onclick="trx()">Load Transactions</button>

<pre id="out"></pre>
</div>

<script>
let token = "";

async function login() {
  const res = await fetch('/api/login', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      email: email.value,
      password: password.value
    })
  });

  const data = await res.json();
  token = data.token;

  alert("Logged in!");
}

async function stats(){
  const r = await fetch('/api/admin/stats', {
    headers:{ Authorization:'Bearer '+token }
  });
  out.innerText = JSON.stringify(await r.json(), null, 2);
}

async function users(){
  const r = await fetch('/api/admin/users', {
    headers:{ Authorization:'Bearer '+token }
  });
  out.innerText = JSON.stringify(await r.json(), null, 2);
}

async function trx(){
  const r = await fetch('/api/admin/transactions', {
    headers:{ Authorization:'Bearer '+token }
  });
  out.innerText = JSON.stringify(await r.json(), null, 2);
}
</script>

</body>
</html>
  `);
});

/* =========================
   START SERVER
========================= */
app.listen(5000, () => {
  console.log("🚀 PRO Admin running on http://localhost:5000");
});