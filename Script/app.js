// Firestore functions come from the /firebase-firestore.js file
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  deleteDoc, // Add this
  doc, // Add this
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import Chart from "https://cdn.jsdelivr.net/npm/chart.js/auto/auto.js";

// If you want analytics, it stays separate, but usually isn't needed for a private app
// import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyABEJLalnR_6dFlfGA9IXE4ObOupQ8eZ2o",
  authDomain: "wall-app-dcfb0.firebaseapp.com",
  projectId: "wall-app-dcfb0",
  storageBucket: "wall-app-dcfb0.firebasestorage.app",
  messagingSenderId: "708313130178",
  appId: "1:708313130178:web:1f8cc06ab259af7da7475b",
  measurementId: "G-X9MQKHDKD9",
};

// Initialize Firebase

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const transCol = collection(db, "transactions");

// 1. Add Expense
window.addExpense = async () => {
  const amount = document.getElementById("exp-amount").value;
  const category = document.getElementById("exp-category").value;
  const account = document.getElementById("exp-account").value;
  const date = document.getElementById("exp-date").value;

  if (!amount || !date) return alert("Fill everything!");

  await addDoc(transCol, {
    type: "expense",
    amount: parseFloat(amount),
    category,
    account,
    date,
    timestamp: new Date(),
  });
  alert("Expense Added!");
};

// 2. Add Income
window.addIncome = async () => {
  const amount = document.getElementById("inc-amount").value;
  const source = document.getElementById("inc-source").value;
  const account = document.getElementById("inc-account").value;
  const date = document.getElementById("inc-date").value;

  if (!amount || !date) return alert("Fill everything!");

  await addDoc(transCol, {
    type: "income",
    amount: parseFloat(amount),
    source,
    account,
    date,
    timestamp: new Date(),
  });
  alert("Income Added!");
};

// 3. Live Updates & Chart
let myChart;
onSnapshot(query(transCol, orderBy("timestamp", "desc")), (snapshot) => {
  let balances = { chk1: 0, chk2: 0, sav: 0, cc: 0 };
  let chartData = {};

  snapshot.forEach((doc) => {
    const data = doc.data();
    // Update Balances
    if (data.type === "income") {
      balances[data.account] += data.amount;
    } else {
      balances[data.account] -= data.amount;
      // Prep Chart Data (Current Month Only)
      const transDate = new Date(data.date);
      if (transDate.getMonth() === new Date().getMonth()) {
        chartData[data.category] =
          (chartData[data.category] || 0) + data.amount;
      }
    }
  });

  // Update UI
  document.getElementById("chk1-bal").innerText =
    `$${balances.chk1.toFixed(2)}`;
  document.getElementById("chk2-bal").innerText =
    `$${balances.chk2.toFixed(2)}`;
  document.getElementById("savings-bal").innerText =
    `$${balances.sav.toFixed(2)}`;
  document.getElementById("cc-bal").innerText =
    `$${Math.abs(balances.cc).toFixed(2)}`;

  updateChart(chartData);
});

function updateChart(chartData) {
  const ctx = document.getElementById("expenseChart").getContext("2d");
  if (myChart) myChart.destroy();
  myChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: Object.keys(chartData),
      datasets: [
        {
          data: Object.values(chartData),
          backgroundColor: ["#bb86fc", "#03dac6", "#cf6679", "#ffb74d"],
        },
      ],
    },
    options: { plugins: { legend: { labels: { color: "white" } } } },
  });
}

// 1. Pay Credit Card Logic
window.payCreditCard = async () => {
  const amount = parseFloat(document.getElementById("pay-amount").value);
  const date = document.getElementById("pay-date").value;
  const fromAccount = document.getElementById("pay-from-account").value;

  if (!amount || !date) return alert("Fill everything!");

  // This creates TWO entries:
  // 1. An expense for the checking account
  // 2. An 'income' (payment) for the CC account
  await addDoc(transCol, {
    type: "payment",
    amount: amount,
    account: fromAccount,
    toAccount: "cc",
    date: date,
    timestamp: new Date(),
  });
  alert("Payment Recorded!");
};

// 2. Update the onSnapshot listener to also render the list
onSnapshot(query(transCol, orderBy("timestamp", "desc")), (snapshot) => {
  let balances = { chk1: 0, chk2: 0, sav: 0, cc: 0 };
  let chartData = {};
  const listElement = document.getElementById("transaction-list");
  listElement.innerHTML = ""; // Clear list before re-rendering

  snapshot.forEach((doc) => {
    const data = doc.data();

    // --- Calculate Balances ---
    if (data.type === "income") {
      balances[data.account] += data.amount;
    } else if (data.type === "expense") {
      balances[data.account] -= data.amount;
      // Add to chart if current month
      const transDate = new Date(data.date);
      if (transDate.getMonth() === new Date().getMonth()) {
        chartData[data.category] =
          (chartData[data.category] || 0) + data.amount;
      }
    } else if (data.type === "payment") {
      balances[data.account] -= data.amount; // Leaves checking
      balances[data.toAccount] += data.amount; // Hits CC (reduces debt)
    }

    // --- Render History Item ---
    // Find this section inside your snapshot.forEach loop:
    const item = document.createElement("div");
    item.className = "history-item";
    const typeClass =
      data.type === "income"
        ? "income-text"
        : data.type === "payment"
          ? "payment-text"
          : "expense-text";
    const symbol = data.type === "income" ? "+" : "-";

    item.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px;">
        <button onclick="deleteTransaction('${doc.id}')" style="background:none; border:none; color:#cf6679; padding:0; cursor:pointer; font-size: 1.2rem;">×</button>
        <div>
            <div style="font-weight:bold">${data.category || data.source || "CC Payment"}</div>
            <small style="color:gray">${data.date} • ${data.account.toUpperCase()}</small>
        </div>
    </div>
    <span class="amount ${typeClass}">${symbol}$${data.amount.toFixed(2)}</span>
`;
    listElement.appendChild(item);
    listElement.appendChild(item);
  });

  // Update Dashboard UI (same as before)
  document.getElementById("chk1-bal").innerText =
    `$${balances.chk1.toFixed(2)}`;
  document.getElementById("chk2-bal").innerText =
    `$${balances.chk2.toFixed(2)}`;
  document.getElementById("savings-bal").innerText =
    `$${balances.sav.toFixed(2)}`;
  document.getElementById("cc-bal").innerText =
    `$${Math.abs(balances.cc).toFixed(2)}`;

  updateChart(chartData);
});

window.deleteTransaction = async (id) => {
  if (confirm("Are you sure you want to delete this transaction?")) {
    try {
      await deleteDoc(doc(db, "transactions", id));
    } catch (error) {
      console.error("Error removing document: ", error);
    }
  }
};
