/********************************************************************
 * Kid's Bank App
 *
 * Reads an XML file containing:
 *   <bank>
 *     <users>
 *       <user>
 *         <name>...</name>
 *         <transactions>...</transactions>
 *         <interestRates>...</interestRates>
 *       </user>
 *       ...
 *     </users>
 *   </bank>
 ********************************************************************/

/* Global Data Structures */
let usersData = [];
let currentUser = null;

// On window load, fetch and parse XML, then populate the user dropdown
window.onload = function () {
  // Replace URL with your actual file location, e.g.:
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
      parseBankXML(xmlDoc);
      populateUserSelect(usersData);
    })
    .catch((err) => {
      console.error("Error fetching/parsing XML:", err);
      alert("Could not load user data from the XML file.");
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
 * 1) parseBankXML: Parse the <bank> -> <users> -> <user> structure
 ********************************************************************/
function parseBankXML(xmlDoc) {
  // Find <users> parent
  const usersParent = xmlDoc.getElementsByTagName("users")[0];
  if (!usersParent) {
    console.error("No <users> element found in XML.");
    return;
  }

  // Grab all <user> elements
  const userNodes = usersParent.getElementsByTagName("user");

  for (let i = 0; i < userNodes.length; i++) {
    const userNode = userNodes[i];

    // (A) Read <name>
    const nameNode = userNode.getElementsByTagName("name")[0];
    const userName = nameNode ? nameNode.textContent : `User ${i+1}`;

    // (B) Parse <transactions> 
    const transactions = [];
    const transactionsParent = userNode.getElementsByTagName("transactions")[0];
    if (transactionsParent) {
      const transactionNodes = transactionsParent.getElementsByTagName("transaction");
      for (let t = 0; t < transactionNodes.length; t++) {
        const txNode = transactionNodes[t];
        
        const date = txNode.getElementsByTagName("date")[0]?.textContent || "";
        const type = txNode.getElementsByTagName("type")[0]?.textContent || "";
        const amountStr = txNode.getElementsByTagName("amount")[0]?.textContent || "0";
        const amount = parseFloat(amountStr) || 0;

        transactions.push({ date, type, amount });
      }
    }

    // (C) Parse <interestRates>
    // Each <interestRate> has <startDate>, <endDate>, <rate>
    const interestRates = [];
    const interestRatesParent = userNode.getElementsByTagName("interestRates")[0];
    if (interestRatesParent) {
      const interestRateNodes = interestRatesParent.getElementsByTagName("interestRate");
      for (let r = 0; r < interestRateNodes.length; r++) {
        const rateNode = interestRateNodes[r];

        const startDate = rateNode.getElementsByTagName("startDate")[0]?.textContent || "";
        const endDate = rateNode.getElementsByTagName("endDate")[0]?.textContent || "";
        const rateStr = rateNode.getElementsByTagName("rate")[0]?.textContent || "0";
        const rate = parseFloat(rateStr) || 0;

        interestRates.push({ startDate, endDate, rate });
      }
    }

    // Push user data object
    usersData.push({
      name: userName,
      transactions: transactions,
      interestRates: interestRates
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

  users.forEach((user, index) => {
    const option = document.createElement("option");
    option.value = index;  // We'll refer to user by index
    option.textContent = user.name;
    userSelect.appendChild(option);
  });
}

/********************************************************************
 * 3) Handle User Login
 ********************************************************************/
function handleLogin() {
  const userSelect = document.getElementById("user-select");
  const selectedIndex = userSelect.value;
  
  // In this revised code, we store the user index in the <option> value
  currentUser = usersData[selectedIndex];

  if (!currentUser) {
    alert("User not found. Please select a valid account.");
    return;
  }

  // Hide login, show main menu
  document.getElementById("login-section").style.display = "none";
  document.getElementById("main-menu").style.display = "block";

  // Show Balance by default
  showBalance();
}

/********************************************************************
 * 4) Compute Current Balance and "Current" Interest Rate
 *
 *   - We do a simple approach here: 
 *     * We only look at the total deposits & withdrawals to get a 
 *       final balance (no daily compounding).
 *     * For the "current interest rate," we look for the rate 
 *       bracket that includes today's date (or if the data is
 *       purely historical, we pick the last bracket).
 *
 *   Adjust or refine as your actual use-case demands.
 ********************************************************************/
function computeBalanceAndRate(user) {
  if (!user) return { balance: 0, rate: 0 };

  // 4A) Sum all deposits/withdrawals
  let balance = 0;
  user.transactions.forEach(tx => {
    if (tx.type.toLowerCase() === "deposit") {
      balance += tx.amount;
    } else if (tx.type.toLowerCase() === "withdrawal") {
      balance -= tx.amount;
    }
  });

  // 4B) Find "current" interest rate by picking the bracket 
  //     that includes today's date (or fallback to the last bracket)
  const today = new Date();
  let currentRate = 0;
  let matchedBracket = null;

  for (const bracket of user.interestRates) {
    const start = new Date(bracket.startDate);
    const end = new Date(bracket.endDate);

    if (start <= today && today <= end) {
      currentRate = bracket.rate;
      matchedBracket = bracket;
      break;
    }
  }

  // If no bracket matched today's date, we may just choose 
  // the last bracket if that fits your logic:
  if (!matchedBracket && user.interestRates.length > 0) {
    currentRate = user.interestRates[user.interestRates.length - 1].rate;
  }

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
 *    - Graph of deposits/withdrawals over time (no daily interest).
 *    - Table of transactions
 ********************************************************************/
function showHistory() {
  hideAllSections();
  document.getElementById("history-section").style.display = "block";

  // A) Render transaction table
  renderTransactionTable();

  // B) Render history graph
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

/* 6B) Render history graph with basic axes */
function renderHistoryGraph() {
  if (!currentUser) return;
  
  const canvas = document.getElementById("history-graph");
  const ctx = canvas.getContext("2d");

  // Clear previous drawing
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Sort transactions by date
  const sortedTransactions = [...currentUser.transactions].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  if (sortedTransactions.length === 0) {
    return; // Nothing to plot
  }

  // We'll build data points by stepping transaction by transaction
  let balance = 0;
  let dataPoints = [];

  sortedTransactions.forEach((tx) => {
    if (tx.type.toLowerCase() === "deposit") {
      balance += tx.amount;
    } else if (tx.type.toLowerCase() === "withdrawal") {
      balance -= tx.amount;
    }
    // push the (date -> balance) record
    dataPoints.push({ date: new Date(tx.date), balance });
  });

  // Determine min/max date
  const minDate = dataPoints[0].date.getTime();
  const maxDate = dataPoints[dataPoints.length - 1].date.getTime();
  // Determine min/max balance
  const minBal = Math.min(...dataPoints.map(dp => dp.balance));
  const maxBal = Math.max(...dataPoints.map(dp => dp.balance));

  // Margins
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

  // Converters for date -> x and balance -> y
  function getXCoord(dateVal) {
    if (maxDate === minDate) return leftMargin;
    return leftMargin + ((dateVal - minDate) / (maxDate - minDate)) * drawWidth;
  }
  function getYCoord(balVal) {
    if (maxBal === minBal) return topMargin + drawHeight;
    return topMargin + drawHeight - ((balVal - minBal) / (maxBal - minBal)) * drawHeight;
  }

  // Plot the line
  ctx.beginPath();
  ctx.strokeStyle = "#007bff";
  ctx.lineWidth = 2;
  dataPoints.forEach((dp, i) => {
    const xPos = getXCoord(dp.date.getTime());
    const yPos = getYCoord(dp.balance);
    if (i === 0) {
      ctx.moveTo(xPos, yPos);
    } else {
      ctx.lineTo(xPos, yPos);
    }
  });
  ctx.stroke();

  // Optional: Label the axis min/max
  ctx.fillStyle = "#000";
  ctx.font = "12px sans-serif";
  // X-axis date labels (start + end)
  ctx.fillText(
    dataPoints[0].date.toLocaleDateString(),
    leftMargin,
    topMargin + drawHeight + 15
  );
  ctx.fillText(
    dataPoints[dataPoints.length - 1].date.toLocaleDateString(),
    leftMargin + drawWidth - 80,
    topMargin + drawHeight + 15
  );
  // Y-axis balance labels (min + max)
  ctx.fillText(minBal.toFixed(2), 5, topMargin + drawHeight);
  ctx.fillText(maxBal.toFixed(2), 5, topMargin + 10);
}

/********************************************************************
 * 7) Show Projection
 *    - Graph of how principal grows over a user-defined number of months
 *      using the "current" interest rate from computeBalanceAndRate.
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
  
  // We'll convert the annual rate to a rough monthly rate:
  // For a small demonstration, we assume simple monthly compounding.
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
  
  // Determine min/max months and balances
  const minMonth = 0;
  const maxMonth = months;
  const minBal = Math.min(...dataPoints.map(dp => dp.balance));
  const maxBal = Math.max(...dataPoints.map(dp => dp.balance));

  // Margins
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

  // Plot the line
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

  // Simple axis labels
  ctx.fillStyle = "#000";
  ctx.font = "12px sans-serif";
  
  // X-axis: min & max month
  ctx.fillText(`${minMonth} mo`, leftMargin, topMargin + drawHeight + 15);
  ctx.fillText(`${maxMonth} mo`, leftMargin + drawWidth - 30, topMargin + drawHeight + 15);

  // Y-axis: min & max balance
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
