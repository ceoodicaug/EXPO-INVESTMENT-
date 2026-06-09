const axios = require("axios");

const CONSUMER_KEY = process.env.PESAPAL_KEY;
const CONSUMER_SECRET = process.env.PESAPAL_SECRET;

// STEP 1: Get token
async function getToken() {
  const res = await axios.post(
    "https://pay.pesapal.com/v3/api/Auth/RequestToken",
    {
      consumer_key: CONSUMER_KEY,
      consumer_secret: CONSUMER_SECRET
    }
  );

  return res.data.token;
}

// STEP 2: Create payment
async function createPayment({ email, amount }) {
  const token = await getToken();

  const payload = {
    id: Date.now().toString(),
    currency: "UGX",
    amount: amount,
    description: "Expo Investment Deposit",
    callback_url: "https://your-site.com/success.html",
    notification_id: "",
    billing_address: {
      email_address: email
    }
  };

  const res = await axios.post(
    "https://pay.pesapal.com/v3/api/Transactions/SubmitOrderRequest",
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  return res.data;
}

module.exports = { createPayment };