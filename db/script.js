/********************************************************************
 * Kid's Bank App
 *
 * Reads an XML file containing users, transactions, and interest rate
 * changes. Implements three main views: Balance, History, Projection.
 *
 ********************************************************************/

/* Global Data Structures */
let usersData = [];
let currentUser = null;

// On window load, fetch and parse XML, then populate user dropdown
window.onload = function () {
  const xmlFileURL = "https://www.dankolab.org/files/dbstatefile.xml"; // The given file
  fetch(xmlFileURL)
    .then((res) => res.text())
    .then((xmlText) => {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "text/xml");
      parseXML(xmlDoc);
      populateUserSelect(usersData);
    });

  // Set up event listeners
  document.getElementById("login-button").addEventListener("click", handleLogin);
  document.getElementById("balance-btn").addEventListener("click", showBalance);
  document.getElementById("history-btn").addEventListener("click", showHistory);
  document.getElementById("projection-btn").addEventListener("click", showProjection);
  document
    .getElementById("projection-update-btn")
    .addEventListener("click", updateProjection);
};

/********************************************************************
 * 1) XML Parsing
 *    Parse the XML to build an in-memory representation of:
 *       - Users
 *       - Transactions (deposits/withdrawals)
 *       - Interest rate changes
 ********************************************************************/
function parseXML(xmlDoc) {
  // Fetch all <user> nodes
  const userNodes = xmlDoc.getElementsByTagName("user");
  for (let i = 0; i < userNodes.length; i++) {
    const userNode = userNodes[i];
    
    const userId = userNode.getAttribute("id") || "";
    const userName = userNode.getElementsByTagName("username")[0]?.textContent || "";
    
    // Transactions
    const transactionNodes = userNode.getElementsByTagName("transaction");
    const transactions = [];
    for (let t = 0; t < transactionNodes.length; t++) {
      const transNode = transactionNodes[t];
      const type = transNode.getAttribute("type");  // deposit or withdraw
      const amount = parseFloat(transNode.getAttribute("amount")) || 0.0;
      const date = transNode.getAttribute("date") || "";
      transactions.push({ type, amount, date });
    }
    
    // Interest Rate Changes
    // Each <interest> node has a date and a rate
    const interestNodes = userNode.getElementsByTagName("interest");
    const interestChanges = [];
    for (let k = 0; k < interestNodes.length; k++) {
      const interestNode = interestNodes[k];
      const date = interestNode.getAttribute("date") || "";
      const rate = parseFloat(interestNode.getAttribute("rate")) || 0.0;
      interestChanges.push({ date, rate });
    }
    
    usersData.push({
      id: userId,
      username: userName,
      transactions: transactions,
      interestChanges: interestChanges,
    });
  }
}

/********************************************************************
 * 2) Populate the user dropdown
 ********************************************************************/
function populateUserSelect(users) {
  const userSelect = document.getElementById("user-select");
  userSelect.innerHTML = ""; // Clear any existing options

  users.forEach((user) => {
    const option = document.createElement("option");
    option.value = user.id;
    option.textContent = user.username;
    userSelect.appendChild(option);
  });
}

/********************************************************************
 * 3) Handle User Login
 ********************************************************************/
function handleLogin() {
  const userSelect = document.getElementById("user-select");
  const userId = userSelect.value;
  
  currentUser = usersData.find((u) => u.id === userId);

  if (!currentUser) {
    alert("User not found. Please select a valid account.");
    return;
  }

  // Show the main menu
  document.getElementById("login-section").style.display = "none";
  document.getElementById("main-menu").style.display = "block";

  // Default to showing Balance information
  showBalance();
}

/********************************************************************
 * 4) Compute Current Balance and Current Interest Rate
 ********************************************************************/
function computeBalanceAndRate(user) {
  if (!user) return { balance: 0, rate: 0 };
  
  // Sort all transactions by date
  const sortedTransactions = [...user.transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
  // Sort interest changes by date
  const sortedInterestChanges = [...user.interestChanges].sort((a, b) => new Date(a.date) - new Date(b.date));
  
  // We'll track the balance as we go, applying interest once a year if the rate changes.
  let balance = 0;
  let currentRate = 0;
  let lastInterestDate = null;
  
  let ti = 0; // index to track interest changes
  
  // Combine all relevant changes (transactions + interest changes) in chronological order
  let combinedEvents = [];

  sortedTransactions.forEach((t) => {
    combinedEvents.push({
      date: t.date,
      type: t.type,
      amount: t.amount,
      eventType: "transaction", // deposit or withdrawal
    });
  });
  sortedInterestChanges.forEach((ic) => {
    combinedEvents.push({
      date: ic.date,
      rate: ic.rate,
      eventType: "interest",
    });
  });

  // Sort combined events by date
  combinedEvents.sort((a, b) => new Date(a.date) - new Date(b.date));

  combinedEvents.forEach((event) => {
    if (event.eventType === "transaction") {
      if (event.type === "deposit") {
        balance += event.amount;
      } else if (event.type === "withdraw") {
        balance -= event.amount;
      }
    } else if (event.eventType === "interest") {
      // When interest changes, we set the current rate
      currentRate = event.rate;
    }
  });

  return { balance, rate: currentRate };
}

/********************************************************************
 * 5) Show Balance
 ********************************************************************/
function showBalance() {
  hideAllSections();
  document.getElementById("balance-section").style.display = "block";

  const { balance, rate } = computeBalanceAndRate(currentUser);
  const balanceDetails = `Current Balance: $${balance.toFixed(2)}<br />
                         Current Interest Rate: ${(rate * 100).toFixed(2)}%`;
  
  document.getElementById("balance-details").innerHTML = balanceDetails;
}

/********************************************************************
 * 6) Show History
 *    - Graph of balance over time
 *    - Table of transactions
 ********************************************************************/
function showHistory() {
  hideAllSections();
  document.getElementById("history-section").style.display = "block";

  // 6A) Render transaction table
  renderTransactionTable();

  // 6B) Render history graph
  renderHistoryGraph();
}

function renderTransactionTable() {
  const tbody = document.querySelector("#history-table tbody");
  tbody.innerHTML = "";
  
  if (!currentUser) return;
  
  // Sort transactions by date
  const sortedTransactions = [...currentUser.transactions].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  sortedTransactions.forEach((t) => {
    const row = document.createElement("tr");
    const dateCell = document.createElement("td");
    const typeCell = document.createElement("td");
    const amountCell = document.createElement("td");

    dateCell.textContent = t.date;
    typeCell.textContent = t.type;
    amountCell.textContent = t.amount.toFixed(2);

    row.appendChild(dateCell);
    row.appendChild(typeCell);
    row.appendChild(amountCell);
    tbody.appendChild(row);
  });
}

function renderHistoryGraph() {
  if (!currentUser) return;
  
  const canvas = document.getElementById("history-graph");
  const ctx = canvas.getContext("2d");

  // Clear previous drawing
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Sort transactions and interest changes by date
  let combinedEvents = [];
  currentUser.transactions.forEach((t) => {
    combinedEvents.push({
      date: t.date,
      type: t.type,
      amount: t.amount,
      eventType: "transaction",
    });
  });
  currentUser.interestChanges.forEach((ic) => {
    combinedEvents.push({
      date: ic.date,
      rate: ic.rate,
      eventType: "interest",
    });
  });
  combinedEvents.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Step through each event, compute the balance for that day
  let balance = 0;
  let dataPoints = [];
  let currentRate = 0;

  combinedEvents.forEach((event) => {
    if (event.eventType === "transaction") {
      if (event.type === "deposit") {
        balance += event.amount;
      } else {
        balance -= event.amount;
      }
      dataPoints.push({ date: event.date, balance });
    } else if (event.eventType === "interest") {
      currentRate = event.rate;
      // We won't apply daily interest compounding here in the history graph
      // (just an approximation). Adjust as needed for precise daily/annual calculations.
    }
  });

  // If no events, nothing to graph
  if (dataPoints.length === 0) return;

  // Convert dates to numeric x-coordinates (index-based)
  // so each point is spaced evenly along the x-axis
  const xSpacing = canvas.width / Math.max(dataPoints.length, 1);
  
  // Find min and max balance for scaling
  const minBalance = Math.min(...dataPoints.map((dp) => dp.balance));
  const maxBalance = Math.max(...dataPoints.map((dp) => dp.balance));
  
  // Padding on top and bottom in pixels
  const yPadding = 20;
  
  // Graph line
  ctx.beginPath();
  ctx.strokeStyle = "#007bff";
  ctx.lineWidth = 2;

  dataPoints.forEach((dp, i) => {
    const xPos = i * xSpacing;
    const yRange = maxBalance - minBalance || 1;
    const yPos =
      canvas.height -
      (((dp.balance - minBalance) / yRange) * (canvas.height - yPadding * 2) + yPadding);

    if (i === 0) {
      ctx.moveTo(xPos, yPos);
    } else {
      ctx.lineTo(xPos, yPos);
    }
  });

  ctx.stroke();
}

/********************************************************************
 * 7) Show Projection
 *    - Graph of how principal grows over a user-defined number of months
 ********************************************************************/
function showProjection() {
  hideAllSections();
  document.getElementById("projection-section").style.display = "block";

  // Render initial projection with default 12 months
  updateProjection();
}

function updateProjection() {
  if (!currentUser) return;
  
  const monthsInput = document.getElementById("projection-months");
  const months = parseInt(monthsInput.value) || 12;
  
  const canvas = document.getElementById("projection-graph");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Get the current balance and rate
  const { balance: currentBalance, rate } = computeBalanceAndRate(currentUser);
  
  // Projection assumes annual compounding
  // We'll convert annual rate to monthly growth for a rough approach:
  //   monthlyRate = (1 + annualRate)^(1/12) - 1
  const monthlyRate = Math.pow(1 + rate, 1 / 12) - 1;
  
  // Generate data points for each month
  let dataPoints = [];
  let runningBalance = currentBalance;
  
  for (let m = 0; m <= months; m++) {
    dataPoints.push({ month: m, balance: runningBalance });
    // Apply monthly interest
    runningBalance += runningBalance * monthlyRate;
  }

  // Draw the projection graph
  const xSpacing = canvas.width / Math.max(dataPoints.length, 1);
  const minBalance = Math.min(...dataPoints.map((dp) => dp.balance));
  const maxBalance = Math.max(...dataPoints.map((dp) => dp.balance));
  const yPadding = 20;

  ctx.beginPath();
  ctx.strokeStyle = "green";
  ctx.lineWidth = 2;

  dataPoints.forEach((dp, i) => {
    const xPos = i * xSpacing;
    const yRange = maxBalance - minBalance || 1;
    const yPos =
      canvas.height -
      (((dp.balance - minBalance) / yRange) * (canvas.height - yPadding * 2) + yPadding);

    if (i === 0) {
      ctx.moveTo(xPos, yPos);
    } else {
      ctx.lineTo(xPos, yPos);
    }
  });

  ctx.stroke();
}

/********************************************************************
 * Utility function: hide all sections
 ********************************************************************/
function hideAllSections() {
  document.getElementById("balance-section").style.display = "none";
  document.getElementById("history-section").style.display = "none";
  document.getElementById("projection-section").style.display = "none";
}
