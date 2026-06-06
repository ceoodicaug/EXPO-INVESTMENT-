import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import path from "path";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const app = express();

app.use(cors());
app.use(express.json());

/* =========================
   SERVE YOUR HTML FILES
========================= */
app.use(express.static("public"));

/* =========================
   DATABASE
========================= */
mongoose.connect("mongodb://127.0.0.1:27017/my_site")
.then(() => console.log("MongoDB connected"));

/* =========================
   MODELS
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
  type: String,
  amount: Number,
  status: { type: String, default: "pending" }
}, { timestamps: true }));

/* =========================
   AUTH
========================= */
const SECRET = "SECRET_KEY_2026";

function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ msg: "No token" });

  try {
    req.user = jwt.verify(token, SECRET);
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
   REGISTER ADMIN (FIRST TIME)
========================= */
app.post("/api/register-admin", async (req, res) => {
  const { name, email, password, secret } = req.body;

  if (secret !== "ADMIN_CREATE_2026") {
    return res.status(403).json({ msg: "Wrong secret" });
  }

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
    SECRET,
    { expiresIn: "1d" }
  );

  res.json({ token, role: user.role });
});

/* =========================
   RECHARGE (DEPOSIT REQUEST)
========================= */
app.post("/api/recharge", auth, async (req, res) => {
  const trx = await Transaction.create({
    userId: req.user.id,
    type: "deposit",
    amount: req.body.amount
  });

  res.json(trx);
});

/* =========================
   WITHDRAW
========================= */
app.post("/api/withdraw", auth, async (req, res) => {
  const trx = await Transaction.create({
    userId: req.user.id,
    type: "withdraw",
    amount: req.body.amount
  });

  res.json(trx);
});

/* =========================
   ADMIN DASHBOARD
========================= */
app.get("/api/admin/stats", auth, adminOnly, async (req, res) => {
  const users = await User.countDocuments();

  const deposits = await Transaction.find({ type: "deposit" });
  const totalDeposit = deposits.reduce((a, b) => a + b.amount, 0);

  res.json({ users, totalDeposit });
});

app.get("/api/admin/users", auth, adminOnly, async (req, res) => {
  res.json(await User.find());
});

app.get("/api/admin/transactions", auth, adminOnly, async (req, res) => {
  res.json(await Transaction.find().sort({ createdAt: -1 }));
});

/* =========================
   APPROVE TRANSACTIONS
========================= */
app.put("/api/admin/approve/:id", auth, adminOnly, async (req, res) => {
  const trx = await Transaction.findById(req.params.id);

  if (!trx) return res.status(404).json({ msg: "Not found" });

  trx.status = "approved";
  await trx.save();

  res.json({ msg: "Approved", trx });
});

/* =========================
   START SERVER
========================= */
app.listen(5000, () => {
  console.log("🚀 Site running on http://localhost:5000");
});