const express = require("express");
const cors = require("cors");
require("dotenv").config();
const pesapal = require("./pesapal");

const app = express();
app.use(cors());
app.use(express.json());

app.post("/api/pay", async (req, res) => {
  try {
    const { email, amount } = req.body;

    const payment = await pesapal.createPayment({
      email,
      amount
    });

    res.json(payment);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));