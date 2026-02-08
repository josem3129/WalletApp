// Use standard NPM imports instead of URLs
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  deleteDoc, 
  doc 
} from "firebase/firestore";
import Chart from 'chart.js/auto';

// Your existing config using environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const transCol = collection(db, "transactions");

// 1. Add Expense
window.addExpense = async () => {
  const amount = document.getElementById("exp-amount").value;
  const category = document.getElementById("exp-category").value;
  const expenseName = document.getElementById("expense-name").value;
  const account = document.getElementById("exp-account").value;
  const date = document.getElementById("exp-date").value;

  if (!amount || !date) return alert("Fill everything!");

  await addDoc(transCol, {
    type: "expense",
    amount: parseFloat(amount),
    category,
    expenseName,
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
  
  if (listElement) listElement.innerHTML = ""; 

  snapshot.forEach((doc) => {
    const data = doc.data();

    // --- Calculate Balances ---
    if (data.type === "income") {
      balances[data.account] += data.amount;
    } else if (data.type === "expense") {
      balances[data.account] -= data.amount;
      const transDate = new Date(data.date);
      // Chart data for current month
      if (transDate.getMonth() === new Date().getMonth()) {
        chartData[data.category] = (chartData[data.category] || 0) + data.amount;
      }
    } else if (data.type === "payment") {
      balances[data.account] -= data.amount;
      balances[data.toAccount] += data.amount;
    }

    // --- Render History Item ---
    const item = document.createElement("div");
    item.className = "history-item";
    const typeClass = data.type === "income" ? "income-text" : data.type === "payment" ? "payment-text" : "expense-text";
    const symbol = data.type === "income" ? "+" : "-";

    item.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px;">
        <button onclick="deleteTransaction('${doc.id}')" style="background:none; border:none; color:#cf6679; padding:0; cursor:pointer; font-size: 1.2rem;">×</button>
        <div>
            <div style="font-weight:bold">${data.category || data.source || "CC Payment"}</div>
            <small style="color:gray">${data.date} • ${data.account.toUpperCase()}</small>
        </div>
    </div>
    <span class="amount ${typeClass}">${symbol}$${data.amount.toFixed(2)}</span>`;
    
    if (listElement) listElement.appendChild(item);
  });

  // Update UI
  document.getElementById("chk1-bal").innerText = `$${balances.chk1.toFixed(2)}`;
  document.getElementById("chk2-bal").innerText = `$${balances.chk2.toFixed(2)}`;
  document.getElementById("savings-bal").innerText = `$${balances.sav.toFixed(2)}`;
  document.getElementById("cc-bal").innerText = `$${Math.abs(balances.cc).toFixed(2)}`;

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
