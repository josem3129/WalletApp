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
  getDocs,
} from "firebase/firestore";
import Chart from "chart.js/auto";
import {
  getAuth,
  signInWithPopup, // Switch back to Popup
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import Papa from "papaparse";
//  Define your category mapping rules
const categoryMap = {
  LEGO: "Hobbies",
  MATERNE: "Work",
  "PAPA MURPHY'S": "Food",
  AMAZON: "Shopping",
  STAPLES: "Office Supplies",
  GOOGLE: "Services",
  JESUSCHRIST: "Donations",
  STARBUCKS: "Food",
  "CITI CARD": "Bills",
};

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
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Login Function
window.login = () => {
  signInWithPopup(auth, provider)
    .then((result) => {
      console.log("Logged in! UID:", result.user.uid);
      showToast("Welcome, " + result.user.displayName);
    })
    .catch((error) => {
      console.error("Login failed:", error.code, error.message);
      // If you see 'auth/popup-blocked', you need to allow popups in the browser
      alert("Login Error: " + error.message);
    });
};

// Logout Function
window.logout = () => {
  signOut(auth)
    .then(() => {
      showToast("Logged Out");
      // Force a reload to clear all app state and the Firestore listener
      window.location.reload();
    })
    .catch((error) => console.error("Logout failed:", error));
};

// Monitor Auth State
let unsubscribe = null; // Variable to store the listener

onAuthStateChanged(auth, (user) => {
  const loginBtn = document.getElementById("login-btn");
  const appContent = document.getElementById("app-content");

  if (user) {
    console.log("Logged in as:", user.displayName, "UID:", user.uid);
    if (loginBtn) loginBtn.innerText = "Logout";
    if (appContent) appContent.style.display = "block";

    // ONLY START LISTENING AFTER LOGIN
    if (!unsubscribe) {
      unsubscribe = onSnapshot(
        query(transCol, orderBy("date", "desc")),
        (snapshot) => {
          // 1. Initialize all accounts, including your new Pocket Change (pc)
          let balances = { chk1: 0, chk2: 0, chk3: 0, sav: 0, cc: 0, pc: 0 };
          let chartData = {};
          const transactions = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          transactions.sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort by date descending
          const listElement = document.getElementById("transaction-list");

          if (listElement) listElement.innerHTML = "";

          transactions.forEach((trans) => {

            if (trans.type === "balanceUpdate" || !trans.amount) return;

            // 2. RUN THE MATH FOR BALANCES
            if (trans.type === "income") {
              balances[trans.account] += trans.amount;
            } else if (trans.type === "expense") {
              balances[trans.account] -= trans.amount;
              // Pocket Change Round-Up Logic
              if (trans.account == "chk1") {
                // Avoid rounding for Pocket Change itself
                const roundUp =
                  trans.amount % 1 === 0 ? 0 : 1 - (trans.amount % 1);
                if (roundUp > 0) {
                  balances[trans.account] -= roundUp;
                  balances["chk3"] += roundUp;
                  console.log(
                    `Round-up of $${roundUp.toFixed(2)} added to Pocket Change!`,
                  );
                  console.log(`CC ${trans.account}`);
                }
              }
              // Update Chart data
              const transDate = new Date(trans.date);
              if (transDate.getMonth() === new Date().getMonth()) {
                chartData[trans.category] =
                  (chartData[trans.category] || 0) + trans.amount;
              }
            } else if (trans.type === "payment") {
              balances[trans.account] -= trans.amount;
              balances[trans.toAccount] += trans.amount;
            }

            // 3. RENDER HISTORY (Your existing code)
            // 1. Skip the 'balanceUpdate' logs that cause the "undefined" rows
            if (trans.type === "balanceUpdate" || !trans.amount) return;

            // 2. Define the Account and Name strings
            const accountRef = trans.account ? trans.account.toUpperCase() : "";
            const nameRef =
              trans.expenseName || trans.category || trans.source || "";

            // 3. Create the display label based on transaction type
            let displayLabel = "";

            if (trans.type === "payment") {
              // For Transfers/CC Payments: Show the flow (e.g., CHK1 → CC)
              const paymentType =
                trans.toAccount === "cc" ? "Credit Card Payment" : "Transfer";
              displayLabel = `${paymentType}: ${accountRef} → ${trans.toAccount.toUpperCase()}`;
            } else {
              // For Expenses/Income: Show "ACCOUNT - NAME" (e.g., CHK1 - LEGO/Hobbies)
              displayLabel = `${accountRef} - ${nameRef}`;
            }

            const accountLabel =
              trans.type === "payment"
                ? `${trans.account.toUpperCase()} → ${trans.toAccount.toUpperCase()}`
                : trans.account.toUpperCase();

            const item = document.createElement("div");
            item.className = "history-item";
            const typeClass =
              trans.type === "income" ? "income-text" : "expense-text";
            const symbol = trans.type === "income" ? "+" : "-";
            console.log("Rendering transaction:", {
              displayLabel,
              accountLabel,
              amount: trans.amount,
            });
            item.innerHTML = `
        <div style="display: flex; align-items: center; width: 80%; gap: 10px; min-width: 0;">
            <button onclick="deleteTransaction('${doc.id}')" class="delete-btn" style="flex-shrink: 0;">×</button>
            <div style="min-width: 0; flex-grow: 1;">
                <div style="font-weight:bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${displayLabel}</div>
                <small style="color:gray; display: block;">${trans.date} • ${accountLabel}</small>
            </div>
        </div>
        <span class="amount ${typeClass}" style="width: 15%; text-align: right; flex-shrink: 0; font-weight: bold;">
            ${symbol}$${trans.amount.toFixed(2)}
        </span>`;

            if (listElement) listElement.appendChild(item);
          });

          // 4. UPDATE UI - Match these IDs to your index.html exactly
          document.getElementById("chk1-bal").innerText =
            `$${balances.chk1.toFixed(2)}`;
          document.getElementById("chk2-bal").innerText =
            `$${balances.chk2.toFixed(2)}`;
          document.getElementById("chk3-bal").innerText =
            `$${balances.chk3.toFixed(2)}`;
          document.getElementById("savings-bal").innerText =
            `$${balances.sav.toFixed(2)}`;
          document.getElementById("cc-bal").innerText =
            `$${Math.abs(balances.cc).toFixed(2)}`;
          document.getElementById("total-bal").innerText = `$${Object.values(
            balances,
          )
            .reduce((a, b) => a + b, 0)
            .toFixed(2)}`;

          // Use 'pc-bal' for Pocket Change to avoid conflicts with chk3
          const pcDisplay = document.getElementById("pc-bal");
          if (pcDisplay) pcDisplay.innerText = `$${balances.pc.toFixed(2)}`;

          updateChart(chartData);
        },
        (error) => {
          console.error("Firestore Error:", error);
        },
      );
    }
  } else {
    // If logged out, stop listening and hide content
    if (loginBtn) {
      loginBtn.innerText = "Login with Google";
      loginBtn.onclick = window.login; // Ensure it points back to login
    }
    if (appContent) {
      appContent.style.display = "none"; // Hide your finances in Nampa
    }

    // Clear out any old data from the list so it doesn't stay visible
    const listElement = document.getElementById("transaction-list");
    if (listElement) listElement.innerHTML = "";
  }
});
// 1. Add Expense
window.addExpense = async () => {
  const amount = document.getElementById("exp-amount").value;
  const category = document.getElementById("exp-category").value;
  const expenseName = document.getElementById("expense-name").value;
  const account = document.getElementById("exp-account").value;
  const date = document.getElementById("exp-date").value;

  console.log("Adding expense:", {
    amount,
    category,
    expenseName,
    account,
    date,
  });

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
  showToast("Payment Recorded!");
  document.getElementById("pay-amount").value = "";
  document.getElementById("pay-date").value = "";
  document.getElementById("pay-from-account").value = "chk1";
};

// // 2. Update the onSnapshot listener to also render the list
// onSnapshot(query(transCol, orderBy("timestamp", "desc")), (snapshot) => {
//   // 1. Initialize all accounts, including your new Pocket Change (pc)
//   let balances = { chk1: 0, chk2: 0, chk3: 0, sav: 0, cc: 0, pc: 0 };
//   let chartData = {};
//   const listElement = document.getElementById("transaction-list");
//   let totalExpenses = 0;

//   if (listElement) listElement.innerHTML = "";

//   snapshot.forEach((doc) => {
//     const data = doc.data();

//     if (data.type === "balanceUpdate" || !data.amount) return;

//     // 2. RUN THE MATH FOR BALANCES
//     if (data.type === "income") {
//       balances[data.account] += data.amount;
//     } else if (data.type === "expense") {
//       balances[data.account] -= data.amount;
//       // Pocket Change Round-Up Logic
//       if (data.account == "chk1") {
//         // Avoid rounding for Pocket Change itself
//         const roundUp = data.amount % 1 === 0 ? 0 : 1 - (data.amount % 1);
//         if (roundUp > 0) {
//           balances[data.account] -= roundUp;
//           balances["chk3"] += roundUp;
//           console.log(
//             `Round-up of $${roundUp.toFixed(2)} added to Pocket Change!`,
//           );
//           console.log(`CC ${data.account}`);
//         }
//       }
//       // Update Chart data
//       const transDate = new Date(data.date);
//       if (transDate.getMonth() === new Date().getMonth()) {
//         chartData[data.category] =
//           (chartData[data.category] || 0) + data.amount;
//       }
//     } else if (data.type === "payment") {
//       balances[data.account] -= data.amount;
//       balances[data.toAccount] += data.amount;
//     }

//     // 3. RENDER HISTORY (Your existing code)
//     // 1. Skip the 'balanceUpdate' logs that cause the "undefined" rows
//     if (data.type === "balanceUpdate" || !data.amount) return;

//     // 2. Define the Account and Name strings
//     const accountRef = data.account ? data.account.toUpperCase() : "";
//     const nameRef = data.expenseName || data.category || data.source || "";

//     // 3. Create the display label based on transaction type
//     let displayLabel = "";

//     if (data.type === "payment") {
//       // For Transfers/CC Payments: Show the flow (e.g., CHK1 → CC)
//       const paymentType =
//         data.toAccount === "cc" ? "Credit Card Payment" : "Transfer";
//       displayLabel = `${paymentType}: ${accountRef} → ${data.toAccount.toUpperCase()}`;
//     } else {
//       // For Expenses/Income: Show "ACCOUNT - NAME" (e.g., CHK1 - LEGO/Hobbies)
//       displayLabel = `${accountRef} - ${nameRef}`;
//     }

//     const accountLabel =
//       data.type === "payment"
//         ? `${data.account.toUpperCase()} → ${data.toAccount.toUpperCase()}`
//         : data.account.toUpperCase();

//     const item = document.createElement("div");
//     item.className = "history-item";
//     const typeClass = data.type === "income" ? "income-text" : "expense-text";
//     const symbol = data.type === "income" ? "+" : "-";
//     console.log("Rendering transaction:", {
//       displayLabel,
//       accountLabel,
//       amount: data.amount,
//     });
//     item.innerHTML = `
//         <div style="display: flex; align-items: center; width: 80%; gap: 10px; min-width: 0;">
//             <button onclick="deleteTransaction('${doc.id}')" class="delete-btn" style="flex-shrink: 0;">×</button>
//             <div style="min-width: 0; flex-grow: 1;">
//                 <div style="font-weight:bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${displayLabel}</div>
//                 <small style="color:gray; display: block;">${data.date} • ${accountLabel}</small>
//             </div>
//         </div>
//         <span class="amount ${typeClass}" style="width: 15%; text-align: right; flex-shrink: 0; font-weight: bold;">
//             ${symbol}$${data.amount.toFixed(2)}
//         </span>`;

//     if (listElement) listElement.appendChild(item);
//   });

//   // 4. UPDATE UI - Match these IDs to your index.html exactly
//   document.getElementById("chk1-bal").innerText =
//     `$${balances.chk1.toFixed(2)}`;
//   document.getElementById("chk2-bal").innerText =
//     `$${balances.chk2.toFixed(2)}`;
//   document.getElementById("chk3-bal").innerText =
//     `$${balances.chk3.toFixed(2)}`;
//   document.getElementById("savings-bal").innerText =
//     `$${balances.sav.toFixed(2)}`;
//   document.getElementById("cc-bal").innerText =
//     `$${Math.abs(balances.cc).toFixed(2)}`;
//   document.getElementById("total-bal").innerText = `$${Object.values(balances)
//     .reduce((a, b) => a + b, 0)
//     .toFixed(2)}`;

//   // Use 'pc-bal' for Pocket Change to avoid conflicts with chk3
//   const pcDisplay = document.getElementById("pc-bal");
//   if (pcDisplay) pcDisplay.innerText = `$${balances.pc.toFixed(2)}`;

//   updateChart(chartData);
// });

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
  setTimeout(() => {
    toast.className = toast.className.replace("show", "");
  }, 3000);
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

function getCategory(desc) {
  const upperDesc = desc.toUpperCase();
  for (const [keyword, category] of Object.entries(categoryMap)) {
    if (upperDesc.includes(keyword)) return category;
  }
  return "General";
}

window.importCSV = async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  // 2. DUPLICATE CHECKER: Fetch existing data first
  const existingSnap = await getDocs(transCol);
  const existingTrans = existingSnap.docs
    .map((doc) => {
      const d = doc.data();

      // 1. Ensure d.amount is a valid number before calling .toFixed()
      const amt =
        typeof d.amount === "number" ? d.amount : parseFloat(d.amount);

      // 2. Skip entries that don't have a valid number (like old logs)
      if (isNaN(amt)) return null;

      return `${d.date}|${amt.toFixed(2)}|${d.expenseName}`;
    })
    .filter((item) => item !== null); // 3. Remove the nulls from the list

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: async (results) => {
      const data = results.data;
      const headers = Object.keys(data[0]);

      const isBank = headers.includes("Transaction Amount");
      const isCC = headers.includes("Debit") && headers.includes("Credit");
      let addedCount = 0;
      let duplicateCount = 0;

      for (const row of data) {
        let transaction = null;
        const desc = row["Description"] || "";

        if (isBank) {
          // --- BANK LOGIC (Checking 100) ---
          const amount = parseFloat(
            String(row["Transaction Amount"]).replace(/,/g, ""),
          );
          if (isNaN(amount)) continue;

          if (desc.toUpperCase().includes("CITI CARD ONLINE")) {
            transaction = {
              type: "payment",
              amount: Math.abs(amount),
              expenseName: "Credit Card Payment",
              category: "Bills",
              account: "chk1",
              toAccount: "cc",
              date: row["Transaction Date"].replace(/\//g, "-"),
              timestamp: new Date(),
            };
          } else {
            transaction = {
              type: amount < 0 ? "expense" : "income",
              amount: Math.abs(amount),
              expenseName: desc,
              category: getCategory(desc),
              account: "chk1",
              date: row["Transaction Date"].replace(/\//g, "-"),
              timestamp: new Date(),
            };
          }
        } else if (isCC) {
          // --- CREDIT CARD LOGIC ---
          const debit = parseFloat(String(row["Debit"]).replace(/,/g, ""));
          // Skip "PAYMENT THANK YOU" as it's handled by the Bank file
          if (desc.toUpperCase().includes("PAYMENT THANK YOU")) continue;

          if (!isNaN(debit)) {
            const [m, d, y] = row["Date"].split("/");
            transaction = {
              type: "expense",
              amount: debit,
              expenseName: desc,
              category: getCategory(desc),
              account: "cc",
              date: `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`,
              timestamp: new Date(),
            };
          }
        }

        // 3. APPLY DUPLICATE CHECK
        if (transaction) {
          const fingerPrint = `${transaction.date}|${transaction.amount.toFixed(2)}|${transaction.expenseName}`;
          if (existingTrans.includes(fingerPrint)) {
            duplicateCount++;
            continue; // Skip if it already exists in Firestore
          }

          await addDoc(transCol, transaction);
          addedCount++;
        }
      }
      showToast(
        `Imported ${addedCount} items. Skipped ${duplicateCount} duplicates.`,
      );
    },
  });
};
let pendingTransactions = []; // Holds items during review


function renderReview() {
  const container = document.getElementById("review-list");
  container.innerHTML = "";

  pendingTransactions.forEach((t, index) => {
    const row = document.createElement("div");
    row.style = `display: grid; grid-template-columns: 100px 1fr 100px 150px; gap: 10px; align-items: center; padding: 10px; border-bottom: 1px solid #333; ${t.isDuplicate ? "opacity: 0.5; background: #2c1a1a;" : ""}`;

    row.innerHTML = `
      <small>${t.date}</small>
      <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${t.expenseName}</div>
      <b style="${t.type === "income" ? "color:#03dac6" : "color:#cf6679"}">$${t.amount.toFixed(2)}</b>
      <select onchange="pendingTransactions[${index}].category = this.value" style="background:#333; color:white; border:none; padding:5px; border-radius:4px;">
        <option value="General" ${t.category === "General" ? "selected" : ""}>General</option>
        <option value="Food" ${t.category === "Food" ? "selected" : ""}>Food</option>
        <option value="Hobbies" ${t.category === "Hobbies" ? "selected" : ""}>Hobbies</option>
        <option value="Work" ${t.category === "Work" ? "selected" : ""}>Work</option>
        <option value="Bills" ${t.category === "Bills" ? "selected" : ""}>Bills</option>
      </select>
    `;
    container.appendChild(row);
  });

  document.getElementById("review-modal").style.display = "block";
}

window.confirmImport = async () => {
  const toSave = pendingTransactions.filter((t) => !t.isDuplicate);
  for (const t of toSave) {
    await addDoc(transCol, { ...t, timestamp: new Date() });
  }
  showToast(`Saved ${toSave.length} new transactions!`);
  closeReview();
};

window.closeReview = () => {
  document.getElementById("review-modal").style.display = "none";
  document.getElementById("csv-file").value = "";
};
