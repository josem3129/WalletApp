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
  doc,
} from "firebase/firestore";
import Chart from "chart.js/auto";

// Your existing config using environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
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
  await addDoc(transCol, { type: "balanceUpdate", account, amount: -parseFloat(amount), timestamp: new Date() });
showToast("Expense Recorded!"); 
  document.getElementById("exp-amount").value = "";
  document.getElementById("exp-category").value = "Food";
  document.getElementById("expense-name").value = "";
  document.getElementById("exp-date").value = "";
  document.getElementById("exp-account").value = "chk1";
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
  await addDoc(transCol, { type: "income added successfully", amount });
showToast("Income Recorded!"); 
  document.getElementById("inc-amount").value = "";
document.getElementById("inc-source").value = "";
document.getElementById("inc-date").value = "";
document.getElementById("inc-account").value = "chk1";
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
  await addDoc(transCol, { type: "payment successful", amount});
showToast("Payment Recorded!");
  document.getElementById("pay-amount").value = "";
  document.getElementById("pay-date").value = "";
  document.getElementById("pay-from-account").value = "chk1";
};

// 2. Update the onSnapshot listener to also render the list
onSnapshot(query(transCol, orderBy("timestamp", "desc")), (snapshot) => {
  // 1. Initialize all accounts, including your new Pocket Change (pc)
  let balances = { chk1: 0, chk2: 0, chk3: 0, sav: 0, cc: 0, pc: 0 };
  let chartData = {};
  const listElement = document.getElementById("transaction-list");

  if (listElement) listElement.innerHTML = "";

  snapshot.forEach((doc) => {
    const data = doc.data();

    // 2. RUN THE MATH FOR BALANCES
    if (data.type === "income") {
      balances[data.account] += data.amount;
    } else if (data.type === "expense") {
      balances[data.account] -= data.amount;

      // Pocket Change Round-Up Logic
      const roundUp = data.amount % 1 === 0 ? 0 : (1 - (data.amount % 1));
      if (roundUp > 0) {
        balances[data.account] -= roundUp;
        balances["chk3"] += roundUp; 
      }

      // Update Chart data
      const transDate = new Date(data.date);
      if (transDate.getMonth() === new Date().getMonth()) {
        chartData[data.category] = (chartData[data.category] || 0) + data.amount;
      }
    } else if (data.type === "payment") {
      balances[data.account] -= data.amount;
      balances[data.toAccount] += data.amount;
    }

    // 3. RENDER HISTORY (Your existing code)
    let displayLabel = data.category || data.source;
    if (data.type === "payment") {
        displayLabel = data.toAccount === "cc" ? "Credit Card Payment" : "Transfer";
    }

    const accountLabel = data.type === "payment" 
        ? `${data.account.toUpperCase()} → ${data.toAccount.toUpperCase()}` 
        : data.account.toUpperCase();

    const item = document.createElement("div");
    item.className = "history-item";
    const typeClass = data.type === "income" ? "income-text" : "expense-text";
    const symbol = data.type === "income" ? "+" : "-";

    item.innerHTML = `
        <div style="display: flex; align-items: center; width: 80%; gap: 10px; min-width: 0;">
            <button onclick="deleteTransaction('${doc.id}')" class="delete-btn" style="flex-shrink: 0;">×</button>
            <div style="min-width: 0; flex-grow: 1;">
                <div style="font-weight:bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${displayLabel}</div>
                <small style="color:gray; display: block;">${data.date} • ${accountLabel}</small>
            </div>
        </div>
        <span class="amount ${typeClass}" style="width: 15%; text-align: right; flex-shrink: 0; font-weight: bold;">
            ${symbol}$${data.amount.toFixed(2)}
        </span>`;

    if (listElement) listElement.appendChild(item);
  });

  // 4. UPDATE UI - Match these IDs to your index.html exactly
  document.getElementById("chk1-bal").innerText = `$${balances.chk1.toFixed(2)}`;
  document.getElementById("chk2-bal").innerText = `$${balances.chk2.toFixed(2)}`;
  document.getElementById("savings-bal").innerText = `$${balances.sav.toFixed(2)}`;
  document.getElementById("cc-bal").innerText = `$${Math.abs(balances.cc).toFixed(2)}`;

  // Use 'pc-bal' for Pocket Change to avoid conflicts with chk3
  const pcDisplay = document.getElementById("chk3-bal");
  if (pcDisplay) pcDisplay.innerText = `$${balances.chk3.toFixed(2)}`;

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

window.showToast = (message) => {
    const toast = document.getElementById("toast");
    toast.innerText = message;
    toast.className = "toast show";
    setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 3000);
};

// Add Transfer Logic
window.addTransfer = async () => {
  const amount = parseFloat(document.getElementById("trans-amount").value);
  const date = document.getElementById("trans-date").value;
  const fromAccount = document.getElementById("trans-from-account").value;
  const toAccount = document.getElementById("trans-to-account").value;

  if (!amount || !date || fromAccount === toAccount) {
    return showToast("Check amounts and accounts!");
  }

  // Creates a 'payment' type transaction that impacts both accounts
  await addDoc(transCol, {
    type: "payment",
    amount: amount,
    account: fromAccount,
    toAccount: toAccount,
    date: date,
    timestamp: new Date(),
  });

  showToast("Transfer Successful!");
  
  // Clear the inputs
  document.getElementById("trans-amount").value = "";
  document.getElementById("trans-date").value = "";
};