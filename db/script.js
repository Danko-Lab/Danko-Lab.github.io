/********************************************************************
 * Kid's Bank App
 *
 * Reads an XML file containing users, transactions, and interest rate
 * changes. Implements three main views: Balance, History, Projection.
 * 
 * Includes simple X/Y axes for the History and Projection charts.
 ********************************************************************/

/* Global Data Structures */
let usersData = [];
let currentUser = null;

// On window load, fetch and parse XML, then populate user dropdown
window.onload = function () {
  const xmlFileURL = "https://www.dankolab.org/files/dbstatefile.xml"; 
  fetch(xmlFileURL)
    .then((res) => {
      if (!res.ok) {
        throw new Error("Failed to fetch XML data.");
      }
      return res.text();
    })
    .then((xmlText) => {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "text/xml");
      parseXML(xmlDoc);
      populateUserSelect(usersData);
    })
    .catch((err) => {
      console.error("Error fetching/parsing XML:", err);
      alert("Could not load the user data from the XML file.");
    });

  // Set up event listeners for buttons
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
    // We will use the <username> tag for the displayed name.
    const userNameTag = userNode.getElementsByTagName("username")[0];
    const userName = userNameTag ? userNameTag.textContent : `User ${i}`;

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

  if (users.length === 0) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "No users found";
    userSelect.appendChild(placeholder);
    return;
  }

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

  // Default to showing Balance
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
  
  // We'll track the balance as we go, applying interest when changes occur.
  let balance = 0;
  let currentRate = 0;
  
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

/* 6A) Render transaction table */
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

/* 6B) Render history graph with simple axes */
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
      currentRate = event.rate; // not specifically used for daily compounding
    }
  });

  // If no events, no data to graph
  if (dataPoints.length === 0) {
    return;
  }

  // Convert each date to a numeric time for axis scaling
  dataPoints.forEach(dp => {
    dp.time = new Date(dp.date).getTime();
  });
  
  // Determine min/max date and balance
  const minDate = Math.min(...dataPoints.map(dp => dp.time));
  const maxDate = Math.max(...dataPoints.map(dp => dp.time));
  const minBal = Math.min(...dataPoints.map(dp => dp.balance));
  const maxBal = Math.max(...dataPoints.map(dp => dp.balance));

  // Set up margins for axes
  const leftMargin = 50;
  const bottomMargin = 25;
  const topMargin = 10;
  const rightMargin = 10;

  const drawWidth = canvas.width - leftMargin - rightMargin;
  const drawHeight = canvas.height - topMargin - bottomMargin;

  // Draw axes
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 1;
  // Y-axis
  ctx.beginPath();
  ctx.moveTo(leftMargin, topMargin);
  ctx.lineTo(leftMargin, topMargin + drawHeight);
  ctx.stroke();
  // X-axis
  ctx.beginPath();
  ctx.moveTo(leftMargin, topMargin + drawHeight);
  ctx.lineTo(leftMargin + drawWidth, topMargin + drawHeight);
  ctx.stroke();

  // Function to convert a date -> x coordinate
  function getXCoord(dateVal) {
    if (maxDate === minDate) return leftMargin; // edge case: no variation
    return leftMargin + ((dateVal - minDate) / (maxDate - minDate)) * drawWidth;
  }
  // Function to convert balance -> y coordinate
  function getYCoord(balVal) {
    if (maxBal === minBal) return topMargin + drawHeight; // edge case: no variation
    return topMargin + drawHeight - ((balVal - minBal) / (maxBal - minBal)) * drawHeight;
  }

  // Plot line
  ctx.beginPath();
  ctx.strokeStyle = "#007bff";
  ctx.lineWidth = 2;
  dataPoints.forEach((dp, i) => {
    const xPos = getXCoord(dp.time);
    const yPos = getYCoord(dp.balance);
    if (i === 0) {
      ctx.moveTo(xPos, yPos);
    } else {
      ctx.lineTo(xPos, yPos);
    }
  });
  ctx.stroke();

  // Draw simple numeric labels on x-axis (start and end date)
  ctx.fillStyle = "#000";
  ctx.font = "12px sans-serif";
  // min date label
  ctx.fillText(new Date(minDate).toLocaleDateString(), leftMargin, topMargin + drawHeight + 15);
  // max date label (shift left by ~100px)
  const maxDateLabel = new Date(maxDate).toLocaleDateString();
  ctx.fillText(maxDateLabel, leftMargin + drawWidth - 80, topMargin + drawHeight + 15);

  // Draw simple numeric labels on y-axis (min and max balance)
  ctx.fillText(minBal.toFixed(2), 5, topMargin + drawHeight);
  ctx.fillText(maxBal.toFixed(2), 5, topMargin + 10);
}

/********************************************************************
 * 7) Show Projection
 *    - Graph of how principal grows over a user-defined number of months
 ********************************************************************/
function showProjection() {
  hideAllSections();
  document.getElementById("projection-section").style.display = "block";
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
  
  // We'll convert annual rate to monthly rate:
  const monthlyRate = Math.pow(1 + rate, 1 / 12) - 1;
  
  // Generate data points for each month
  let dataPoints = [];
  let runningBalance = currentBalance;
  
  for (let m = 0; m <= months; m++) {
    dataPoints.push({ month: m, balance: runningBalance });
    runningBalance += runningBalance * monthlyRate;
  }

  // If there's no data, exit
  if (dataPoints.length === 0) return;
  
  // We’ll plot the month on the x-axis and the balance on the y-axis
  const minMonth = 0;
  const maxMonth = months;
  const minBal = Math.min(...dataPoints.map(dp => dp.balance));
  const maxBal = Math.max(...dataPoints.map(dp => dp.balance));

  // Setup margins
  const leftMargin = 50;
  const bottomMargin = 25;
  const topMargin = 10;
  const rightMargin = 10;

  const drawWidth = canvas.width - leftMargin - rightMargin;
  const drawHeight = canvas.height - topMargin - bottomMargin;

  // Draw axes
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 1;
  // Y-axis
  ctx.beginPath();
  ctx.moveTo(leftMargin, topMargin);
  ctx.lineTo(leftMargin, topMargin + drawHeight);
  ctx.stroke();
  // X-axis
  ctx.beginPath();
  ctx.moveTo(leftMargin, topMargin + drawHeight);
  ctx.lineTo(leftMargin + drawWidth, topMargin + drawHeight);
  ctx.stroke();

  // Converters
  function getXCoord(monthVal) {
    if (maxMonth === minMonth) return leftMargin;
    return leftMargin + ((monthVal - minMonth) / (maxMonth - minMonth)) * drawWidth;
  }
  function getYCoord(balVal) {
    if (maxBal === minBal) return topMargin + drawHeight;
    return topMargin + drawHeight - ((balVal - minBal) / (maxBal - minBal)) * drawHeight;
  }

  // Draw projection line
  ctx.beginPath();
  ctx.strokeStyle = "green";
  ctx.lineWidth = 2;
  dataPoints.forEach((dp, i) => {
    const xPos = getXCoord(dp.month);
    const yPos = getYCoord(dp.balance);
    if (i === 0) {
      ctx.moveTo(xPos, yPos);
    } else {
      ctx.lineTo(xPos, yPos);
    }
  });
  ctx.stroke();

  // Draw axis labels
  ctx.fillStyle = "#000";
  ctx.font = "12px sans-serif";

  // X-axis: min and max month
  ctx.fillText(`${minMonth} mo`, leftMargin, topMargin + drawHeight + 15);
  ctx.fillText(`${maxMonth} mo`, leftMargin + drawWidth - 30, topMargin + drawHeight + 15);

  // Y-axis: min and max balance
  ctx.fillText(minBal.toFixed(2), 5, topMargin + drawHeight);
  ctx.fillText(maxBal.toFixed(2), 5, topMargin + 10);
}

/********************************************************************
 * Utility function: hide all sections
 ********************************************************************/
function hideAllSections() {
  document.getElementById("balance-section").style.display = "none";
  document.getElementById("history-section").style.display = "none";
  document.getElementById("projection-section").style.display = "none";
}
