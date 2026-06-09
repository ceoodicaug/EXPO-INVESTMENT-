async function deposit() {
  const email = document.getElementById("email").value;
  const amount = document.getElementById("amount").value;

  const res = await fetch("https://YOUR-BACKEND-URL/api/pay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, amount })
  });

  const data = await res.json();

  if (data.redirect_url) {
    window.location.href = data.redirect_url;
  } else {
    alert("Payment failed");
  }
}