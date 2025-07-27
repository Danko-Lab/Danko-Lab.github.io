/********************************************************************
 * DaddyBank Kid's Bank App – now with on‑the‑fly monthly compounding interest
 * (c) 2025 Charles Danko
 *
 * Changes vs. prior draft:
 *  • Parse <interestRates> under EACH <user>.
 *  • All APY lookups use user.interestRates.
 *  • UI behavior unchanged: Balance shows accrued-to-today; History
 *    shows completed-month "Interest" rows; Projection page unchanged.
 ********************************************************************/

/* ---------------------------- Global State ---------------------------- */

let usersData = [];   // [{ name, transactions:[{date,type,amount}], interestRates:[{startDate,endDate,rate}] }]
let currentUser = null;

/* ----------------------------- Bootstrap ------------------------------ */

window.onload = function () {
  const xmlFileURL = "https://www.dankolab.org/files/dbstatefile.xml";

  fetch(xmlFileURL)
    .then((res) => {
      if (!res.ok) throw new Error("Failed to fetch XML data.");
      return res.text();
    })
    .then((xmlText) => {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "text/xml");
      parseBankXML(xmlDoc);          // fills usersData with per-user interestRates
      populateUserSelect(usersData);
    })
    .catch((err) => {
      console.error("Error fetching/parsing XML:", err);
      alert("Could not load user data from the XML file.");
    });

  document.getElementById("login-button").addEventListener("click", handleLogin);
  document.getElementById("balance-btn").addEventListener("click", showBalance);
  document.getElementById("history-btn").addEventListener("click", showHistory);
  document.getElementById("projection-btn").addEventListener("click", showProjection);
  document.getElementById("projection-update-btn").addEventListener("click", updateProjection);
};

/********************************************************************
 * 1) Parse XML (users, transactions, and per-user interestRates)
 ********************************************************************/
function parseBankXML(xmlDoc) {
  const usersParent = xmlDoc.getElementsByTagName("users")[0];
  const userNodes = usersParent ? usersParent.getElementsByTagName("user") : [];

  for (let i = 0; i < userNodes.length; i++) {
    const userNode = userNodes[i];

    // name
    const nameNode = userNode.getElementsByTagName("name")[0];
    const userName = nameNode ? nameNode.textContent.trim() : `User ${i + 1}`;

    // transactions
    const transactions = [];
    const transactionsParent = userNode.getElementsByTagName("transactions")[0];
    if (transactionsParent) {
      const txNodes = transactionsParent.getElementsByTagName("transaction");
      for (let t = 0; t < txNodes.length; t++) {
        const tx = txNodes[t];
        const date = tx.getElementsByTagName("date")[0]?.textContent?.trim() || "";
        const type = tx.getElementsByTagName("type")[0]?.textContent?.trim() || "";
        const amountStr = tx.getElementsByTagName("amount")[0]?.textContent?.trim() || "0";
        const amount = parseFloat(amountStr) || 0;
        transactions.push({ date, type, amount });
      }
    }

    // per-user interestRates
    const interestRates = [];
    const irContainer = userNode.getElementsByTagName("interestRates")[0];
    if (irContainer) {
      const rateNodes = irContainer.getElementsByTagName("interestRate");
      for (let r = 0; r < rateNodes.length; r++) {
        const node = rateNodes[r];
        const startDate = node.getElementsByTagName("startDate")[0]?.textContent?.trim() || "";
        const endDate = node.getElementsByTagName("endDate")[0]?.textContent?.trim() || "";
        let rateVal = node.getElementsByTagName("rate")[0]?.textContent?.trim() || "0";
        let rate = parseFloat(rateVal) || 0;
        // Accept either 0.10 for 10% or 10 for 10%
        if (rate > 1) rate = rate / 100;
        interestRates.push({ startDate, endDate, rate });
      }
    }
    interestRates.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

    usersData.push({ name: userName, transactions, interestRates });
  }
}

/********************************************************************
 * 2) UI: user select & login
 ********************************************************************/
function populateUserSelect(users) {
  const userSelect = document.getElementById("user-select");
  userSelect.innerHTML = "";

  if (!users || !users.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No users found";
    userSelect.appendChild(opt);
    return;
  }

  users.forEach((u, idx) => {
    const opt = document.createElement("option");
    opt.value = idx;
    opt.textContent = u.name;
    userSelect.appendChild(opt);
  });
}

function handleLogin() {
  const idx = document.getElementById("user-select").value;
  currentUser = usersData[idx];
  if (!currentUser) {
    alert("User not found. Please select a valid account.");
    return;
  }
  document.getElementById("login-section").style.display = "none";
  document.getElementById("main-menu").style.display = "block";
  showBalance();
}

/********************************************************************
 * 3) Date/math helpers
 ********************************************************************/
function monthlyRateFromAPY(apy) {
  return Math.pow(1 + (apy || 0), 1 / 12) - 1;
}
function iso(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function firstDayNextMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}
function daysInMonth(d) {
  return endOfMonth(d).getDate();
}
function localDate(isoStr) {
  // "2025-06-01"  ->  2025-06-01T00:00 in local time
  const [y, m, d] = isoStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/********************************************************************
 * 4) APY lookup — per user
 ********************************************************************/
function apyForDateUser(user, d) {
  if (!user?.interestRates?.length) return 0;
  for (const br of user.interestRates) {
    const s = localDate(br.startDate);
    const e = localDate(br.endDate);
    if (s <= d && d <= e) return br.rate || 0;
  }
  return 0;
}

/********************************************************************
 * 5) Core engine: compute balances & interest schedule for a user
 ********************************************************************/
function computeInterestSchedule(user, today = new Date()) {
  if (!user) {
    return {
      baseBalance: 0,
      totalInterestCredited: 0,
      accruedCurrentMonth: 0,
      currentBalanceWithInterest: 0,
      interestTx: [],
      startBalThisMonth: 0,
      nextMonthEstInterest: 0
    };
  }

  // Normalize tx signs
  const txSorted = [...user.transactions]
    .map((t) => {
      const ttype = (t.type || "").toLowerCase();
      let signed = 0;
      if (ttype === "deposit" || ttype === "credit") signed = +(parseFloat(t.amount) || 0);
      else if (ttype === "withdrawal" || ttype === "debit") signed = -(parseFloat(t.amount) || 0);
      return { date: t.date, type: t.type, amount: signed };
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (!txSorted.length) {
    return {
      baseBalance: 0,
      totalInterestCredited: 0,
      accruedCurrentMonth: 0,
      currentBalanceWithInterest: 0,
      interestTx: [],
      startBalThisMonth: 0,
      nextMonthEstInterest: 0
    };
  }

  const baseBalance = txSorted.reduce((s, t) => s + t.amount, 0);

  const firstDeposit = txSorted.find((t) => t.amount > 0);
  if (!firstDeposit) {
    return {
      baseBalance,
      totalInterestCredited: 0,
      accruedCurrentMonth: 0,
      currentBalanceWithInterest: baseBalance,
      interestTx: [],
      startBalThisMonth: 0,
      nextMonthEstInterest: 0
    };
  }

  const clockStart = startOfMonth(new Date(firstDeposit.date));
  const currentMonthStart = startOfMonth(today);
  const lastFullMonthEnd = endOfMonth(new Date(today.getFullYear(), today.getMonth() - 1, 1));

  function sumTxBetween(d1, d2) {
    const a = new Date(d1), b = new Date(d2);
    let s = 0;
    for (const t of txSorted) {
      const td = localDate(t.date);
      if (a <= td && td <= b) s += t.amount;
    }
    return s;
  }
  function sumTxBefore(d) {
    const b = new Date(d);
    let s = 0;
    for (const t of txSorted) {
      const td = localDate(t.date);
      if (td < b) s += t.amount;
    }
    return s;
  }

  let runningStartBal = sumTxBefore(clockStart);
  let totalInterestCredited = 0;
  const interestTx = [];

  // Completed months
  let mStart = new Date(clockStart);
  while (mStart <= lastFullMonthEnd) {
    const apy = apyForDateUser(user, mStart);
    const mRate = monthlyRateFromAPY(apy);
    const interest = runningStartBal * mRate;

    const mEnd = endOfMonth(mStart);
    if (interest !== 0) {
      interestTx.push({
        date: iso(mEnd),
        type: "Interest",
        amount: +interest
      });
    }
    totalInterestCredited += interest;

    const monthTx = sumTxBetween(mStart, mEnd);
    runningStartBal = runningStartBal + interest + monthTx;

    mStart = firstDayNextMonth(mStart);
  }

  const startBalThisMonth = runningStartBal;

  // Partial accrual for current month
  const apyCurrent = apyForDateUser(user, currentMonthStart);
  const mRateCurrent = monthlyRateFromAPY(apyCurrent);
  const fullMonthInterestCurrent = startBalThisMonth * mRateCurrent;

  const dim = daysInMonth(currentMonthStart);
  const elapsedDays = Math.min(dim, today.getDate());
  const accruedCurrentMonth = fullMonthInterestCurrent * (elapsedDays / dim);

  const monthTxToDate = sumTxBetween(currentMonthStart, today);

  const currentBalanceWithInterest =
    startBalThisMonth + monthTxToDate + accruedCurrentMonth;

  // Next month estimate (assumes no more tx this month)
  const predictedStartNextMonth =
    startBalThisMonth + fullMonthInterestCurrent + monthTxToDate;

  const nextMonthStart = firstDayNextMonth(currentMonthStart);
  const apyNext = apyForDateUser(user, nextMonthStart);
  const nextMonthlyRate = monthlyRateFromAPY(apyNext);
  const nextMonthEstInterest = predictedStartNextMonth * nextMonthlyRate;

  return {
    baseBalance,
    totalInterestCredited,
    accruedCurrentMonth,
    currentBalanceWithInterest,
    interestTx,
    startBalThisMonth,
    nextMonthEstInterest
  };
}

/********************************************************************
 * 6) Balance view
 ********************************************************************/
function showBalance() {
  hideAllSections();
  document.getElementById("balance-section").style.display = "block";

  const sched = computeInterestSchedule(currentUser);
  const currentBalance = sched.currentBalanceWithInterest;

  const todayAPY = apyForDateUser(currentUser, new Date());

  const details = `Current Balance: $${currentBalance.toFixed(2)}<br>
Current Interest Rate: ${(todayAPY * 100).toFixed(2)}%`;
  document.getElementById("balance-details").innerHTML = details;

  document.getElementById("total-interest").textContent =
    `Total Interest Earned: $${(sched.totalInterestCredited + sched.accruedCurrentMonth).toFixed(2)}`;

  document.getElementById("next-month-interest").textContent =
    `Next Month's Interest (est.): $${sched.nextMonthEstInterest.toFixed(2)}`;
}

/********************************************************************
 * 7) History view
 ********************************************************************/
function showHistory() {
  hideAllSections();
  document.getElementById("history-section").style.display = "block";

  renderTransactionTable();
  renderHistoryGraph();
}

function buildAugmentedTransactions(includeFuture = false) {
  if (!currentUser) return [];
  const { interestTx } = computeInterestSchedule(currentUser);
  const today = new Date();

  const userTx = currentUser.transactions.map((t) => {
    const ttype = (t.type || "").toLowerCase();
    let signed = 0;
    if (ttype === "deposit" || ttype === "credit") signed = +(parseFloat(t.amount) || 0);
    else if (ttype === "withdrawal" || ttype === "debit") signed = -(parseFloat(t.amount) || 0);
    return { date: t.date, type: t.type, amount: signed };
  });

  const finalizedInterest = interestTx.filter((it) => {
    if (includeFuture) return true;
    return localDate(it.date) <= today;
  }).map((it) => ({ date: it.date, type: "Interest", amount: it.amount }));

  const all = [...userTx, ...finalizedInterest];
  all.sort((a, b) => localDate(a.date) - localDate(b.date));
  return all;
}

function renderTransactionTable() {
  const tbody = document.querySelector("#history-table tbody");
  tbody.innerHTML = "";
  if (!currentUser) return;

  const rows = buildAugmentedTransactions(false);
  rows.forEach((t) => {
    const tr = document.createElement("tr");

    const tdDate = document.createElement("td");
    tdDate.textContent = t.date;

    const tdType = document.createElement("td");
    tdType.textContent = t.type;

    const tdAmt = document.createElement("td");
    tdAmt.textContent = (Math.round(t.amount * 100) / 100).toFixed(2);

    tr.appendChild(tdDate);
    tr.appendChild(tdType);
    tr.appendChild(tdAmt);
    tbody.appendChild(tr);
  });
}

/* Simple canvas line chart */
function renderHistoryGraph() {
  if (!currentUser) return;
  const canvas = document.getElementById("history-graph");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const rows = buildAugmentedTransactions(false);
  if (!rows.length) return;

  let bal = 0;
  const dataPoints = [];
  rows.forEach((r) => {
   bal += r.amount;
   dataPoints.push({ date: localDate(r.date), balance: bal });
  });

  const minDate = dataPoints[0].date.getTime();
  const maxDate = dataPoints[dataPoints.length - 1].date.getTime();
  const minBal = Math.min(...dataPoints.map((d) => d.balance));
  const maxBal = Math.max(...dataPoints.map((d) => d.balance));

  const left = 50, right = 10, top = 10, bottom = 25;
  const w = canvas.width - left - right;
  const h = canvas.height - top - bottom;

  // axes
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(left, top); ctx.lineTo(left, top + h); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(left, top + h); ctx.lineTo(left + w, top + h); ctx.stroke();

  function x(d) {
    if (maxDate === minDate) return left;
    return left + ((d - minDate) / (maxDate - minDate)) * w;
  }
  function y(v) {
    if (maxBal === minBal) return top + h;
    return top + h - ((v - minBal) / (maxBal - minBal)) * h;
  }

  ctx.beginPath();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#007bff";
  dataPoints.forEach((p, i) => {
    const X = x(p.date.getTime()), Y = y(p.balance);
    if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
  });
  ctx.stroke();

  ctx.fillStyle = "#000";
  ctx.font = "12px sans-serif";
  ctx.fillText(dataPoints[0].date.toLocaleDateString(), left, top + h + 15);
  ctx.fillText(dataPoints[dataPoints.length - 1].date.toLocaleDateString(), left + w - 80, top + h + 15);
  ctx.fillText(minBal.toFixed(2), 5, top + h);
  ctx.fillText(maxBal.toFixed(2), 5, top + 10);
}

/********************************************************************
 * 8) Projection (unchanged visuals; uses user's APY for "today")
 ********************************************************************/
function showProjection() {
  hideAllSections();
  document.getElementById("projection-section").style.display = "block";
  updateProjection();
}

function updateProjection() {
  if (!currentUser) return;

  const months = parseInt(document.getElementById("projection-months").value) || 12;
  const canvas = document.getElementById("projection-graph");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const sched = computeInterestSchedule(currentUser);
  let runningBalance = sched.currentBalanceWithInterest;

  const todayAPY = apyForDateUser(currentUser, new Date());
  const mRate = monthlyRateFromAPY(todayAPY);

  const dataPoints = [];
  for (let m = 0; m <= months; m++) {
    dataPoints.push({ month: m, balance: runningBalance });
    runningBalance += runningBalance * mRate;
  }
  if (!dataPoints.length) return;

  const minMonth = 0, maxMonth = months;
  const minBal = Math.min(...dataPoints.map((d) => d.balance));
  const maxBal = Math.max(...dataPoints.map((d) => d.balance));

  const left = 50, right = 10, top = 10, bottom = 25;
  const w = canvas.width - left - right;
  const h = canvas.height - top - bottom;

  ctx.strokeStyle = "#000";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(left, top); ctx.lineTo(left, top + h); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(left, top + h); ctx.lineTo(left + w, top + h); ctx.stroke();

  function x(m) {
    if (maxMonth === minMonth) return left;
    return left + ((m - minMonth) / (maxMonth - minMonth)) * w;
  }
  function y(v) {
    if (maxBal === minBal) return top + h;
    return top + h - ((v - minBal) / (maxBal - minBal)) * h;
  }

  ctx.beginPath();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "green";
  dataPoints.forEach((p, i) => {
    const X = x(p.month), Y = y(p.balance);
    if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
  });
  ctx.stroke();

  ctx.fillStyle = "#000";
  ctx.font = "12px sans-serif";
  ctx.fillText(`${minMonth} mo`, left, top + h + 15);
  ctx.fillText(`${maxMonth} mo`, left + w - 30, top + h + 15);
  ctx.fillText(minBal.toFixed(2), 5, top + h);
  ctx.fillText(maxBal.toFixed(2), 5, top + 10);
}

/********************************************************************
 * Utility
 ********************************************************************/
function hideAllSections() {
  document.getElementById("balance-section").style.display = "none";
  document.getElementById("history-section").style.display = "none";
  document.getElementById("projection-section").style.display = "none";
}
