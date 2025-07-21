/********************************************************************
 * Kid's Bank App – now with on‑the‑fly monthly compounding interest
 * (c) 2025 Charles Danko
 ********************************************************************/

/* ---------- Global Data ---------- */
let usersData       = [];
let globalRates     = [];     // <interestRate> elements defined outside <user>
let currentUser     = null;

/* -----------------------------------------------------------------
 * 0.  Bootstrap
 * ----------------------------------------------------------------*/
window.onload = () => {
  const xmlFileURL = "https://www.dankolab.org/files/dbstatefile.xml";

  fetch(xmlFileURL)
    .then(res => {
      if (!res.ok) throw new Error("Failed to fetch XML data");
      return res.text();
    })
    .then(xmlText => {
      const doc = new DOMParser().parseFromString(xmlText,"text/xml");
      parseBankXML(doc);
      populateUserSelect(usersData);
    })
    .catch(err => {
      console.error(err);
      alert("Could not load user data from the XML file.");
    });

  /* UI handlers */
  document.getElementById("login-button"         ).addEventListener("click", handleLogin);
  document.getElementById("balance-btn"          ).addEventListener("click", showBalance);
  document.getElementById("history-btn"          ).addEventListener("click", showHistory);
  document.getElementById("projection-btn"       ).addEventListener("click", showProjection);
  document.getElementById("projection-update-btn").addEventListener("click", updateProjection);
};

/* -----------------------------------------------------------------
 * 1.  XML parsing
 * ----------------------------------------------------------------*/
function parseBankXML(xmlDoc) {
  /* 1A – global <interestRate> list (optional) */
  const globalRateNodes = Array.from(xmlDoc.getElementsByTagName("interestRates"))
    .filter(node => node.parentElement.tagName.toLowerCase() !== "user");   // keep only root‑level
  if (globalRateNodes.length) {
    globalRateNodes[0].querySelectorAll("interestRate").forEach(r => {
      globalRates.push({
        start : r.querySelector("start")?.textContent ?? "",
        end   : r.querySelector("end")  ?.textContent ?? "",
        rate  : +r.querySelector("rate")?.textContent || 0
      });
    });
  }

  /* 1B – users */
  const userNodes = xmlDoc.getElementsByTagName("user");
  for (let i=0;i<userNodes.length;i++) {
    const u      = userNodes[i];
    const name   = u.querySelector("name")?.textContent ?? `User ${i+1}`;

    /* transactions */
    const transactions = [];
    u.querySelectorAll("transactions > transaction").forEach(t => {
      transactions.push({
        date   : t.querySelector("date" )?.textContent ?? "",
        type   : t.querySelector("type" )?.textContent.toLowerCase() ?? "",
        amount : +t.querySelector("amount")?.textContent || 0
      });
    });

    /* user‑specific rates (still supported) */
    const rates = [];
    u.querySelectorAll("interestRates > interestRate").forEach(r => {
      rates.push({
        start : r.querySelector("start")?.textContent ?? "",
        end   : r.querySelector("end")  ?.textContent ?? "",
        rate  : +r.querySelector("rate")?.textContent || 0
      });
    });

    usersData.push({name, transactions, interestRates: rates});
  }
}

/* -----------------------------------------------------------------
 * 2.  Helpers
 * ----------------------------------------------------------------*/
function getRatesForUser(user){
  return user.interestRates.length ? user.interestRates : globalRates;
}

function findRateOnDate(rates, dateObj){
  for (const r of rates){
    const s = new Date(r.start);
    const e = new Date(r.end);
    if (s <= dateObj && dateObj <= e) return r.rate;
  }
  return 0; // default if no bracket
}

function formatDate(dateObj){
  return dateObj.toISOString().split("T")[0];
}

/* -----------------------------------------------------------------
 * 3.  Interest math
 * ----------------------------------------------------------------*/
function computeInterestData(user){
  /* Return cached result if we’ve already computed interest today. */
  const todayKey = new Date().toDateString();
  if (user._interestCache && user._interestCache.key === todayKey){
    return user._interestCache.data;
  }

  const allRates   = getRatesForUser(user);
  const tx         = [...user.transactions].sort((a,b)=>new Date(a.date)-new Date(b.date));
  const firstDep   = tx.find(t => t.type === "deposit");
  if (!firstDep){
    return {interestTx:[], totalInt:0, curBal:tx.reduce(sumTx,0), nextInt:0, curRate:0};
  }

  /* Step through months after the first deposit’s month */
  let runningBal   = 0;
  let interestTx   = [];
  let tIdx         = 0;
  const today      = new Date();
  const firstMonth = new Date(firstDep.date);
  firstMonth.setDate(1);                        // 1st of that month
  firstMonth.setMonth(firstMonth.getMonth()+1); // next month

  for (let d = new Date(firstMonth); d <= today; d.setMonth(d.getMonth()+1)){
    /* Add all transactional activity strictly before this month */
    while (tIdx < tx.length && new Date(tx[tIdx].date) < d){
      const t = tx[tIdx++];
      if (t.type === "deposit")   runningBal += t.amount;
      else if (t.type === "debit" || t.type==="withdrawal") runningBal -= t.amount;
    }

    /* Balance at start of month is now runningBal */
    const apy         = findRateOnDate(allRates, d);
    const monthlyRate = Math.pow(1+apy,1/12)-1;
    const intEarned   = +(runningBal * monthlyRate).toFixed(2);

    if (intEarned !== 0){
      runningBal += intEarned;
      const lastDay = new Date(d.getFullYear(), d.getMonth()+1, 0);
      interestTx.push({date: formatDate(lastDay), type:"interest", amount:intEarned});
    }
  }

  /* Total interest earned so far */
  const totalInt = interestTx.reduce((s,t)=>s + t.amount,0);

  /* Finish replaying any remaining user transactions up through today */
  while (tIdx < tx.length){
    const t = tx[tIdx++];
    if (t.type === "deposit")      runningBal += t.amount;
    else if (t.type==="debit" || t.type==="withdrawal") runningBal -= t.amount;
  }

  /* Next month’s estimate (simple 30‑day approximation) */
  const curRate      = findRateOnDate(allRates, today);
  const nextInt      = +(runningBal * (Math.pow(1+curRate,1/12)-1)).toFixed(2);

  /* Cache & return */
  const data = {interestTx, totalInt, curBal:runningBal, nextInt, curRate};
  user._interestCache = {key: todayKey, data};
  return data;
}

function sumTx(acc,t){ return acc + (t.type==="deposit"?t.amount:-t.amount); }

/* -----------------------------------------------------------------
 * 4.  UI plumbing
 * ----------------------------------------------------------------*/
function populateUserSelect(users){
  const sel = document.getElementById("user-select");
  sel.innerHTML = "";
  users.forEach((u,i)=>{
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = u.name;
    sel.appendChild(opt);
  });
}

function handleLogin(){
  const idx = +document.getElementById("user-select").value;
  currentUser = usersData[idx] ?? null;
  if (!currentUser){ alert("Select a valid account"); return; }

  document.getElementById("login-section").style.display = "none";
  document.getElementById("main-menu"   ).style.display = "block";
  showBalance();
}

/* ---------- Balance view ---------- */
function showBalance(){
  hideAllSections();
  document.getElementById("balance-section").style.display = "block";

  const {curBal,totalInt,nextInt,curRate} = computeInterestData(currentUser);

  document.getElementById("balance-details").innerHTML =
    `Current Balance: $${curBal.toFixed(2)}<br>Current Interest Rate: ${(curRate*100).toFixed(2)} %`;

  document.getElementById("total-interest").textContent =
    `Total Interest Earned: $${totalInt.toFixed(2)}`;

  document.getElementById("next-interest").textContent =
    `Next Month's Interest (est.): ≈ $${nextInt.toFixed(2)}`;
}

/* ---------- History view ---------- */
function showHistory(){
  hideAllSections();
  document.getElementById("history-section").style.display = "block";
  renderTransactionTable();
  renderHistoryGraph();
}

function renderTransactionTable(){
  const tbody   = document.querySelector("#history-table tbody");
  tbody.innerHTML = "";

  const {interestTx} = computeInterestData(currentUser);
  const combined     = [...currentUser.transactions, ...interestTx]
    .sort((a,b)=>new Date(a.date)-new Date(b.date));

  combined.forEach(t=>{
    const row   = document.createElement("tr");
    const cDate = document.createElement("td");
    const cType = document.createElement("td");
    const cAmt  = document.createElement("td");

    cDate.textContent = t.date;
    cType.textContent = t.type.charAt(0).toUpperCase()+t.type.slice(1);
    cAmt .textContent = t.amount.toFixed(2);

    row.append(cDate,cType,cAmt);
    tbody.appendChild(row);
  });
}

/* ---------- History graph (unchanged except using interest‑inclusive data) ---------- */
function renderHistoryGraph(){
  if (!currentUser) return;

  const canvas = document.getElementById("history-graph");
  const ctx    = canvas.getContext("2d");
  ctx.clearRect(0,0,canvas.width,canvas.height);

  const {interestTx} = computeInterestData(currentUser);
  const combined     = [...currentUser.transactions, ...interestTx]
    .sort((a,b)=>new Date(a.date)-new Date(b.date));

  if (!combined.length) return;

  /* Build running balance series */
  let bal = 0;
  const dataPoints = [];
  combined.forEach(tx=>{
    if (tx.type==="deposit")        bal += tx.amount;
    else if (tx.type==="debit" || tx.type==="withdrawal") bal -= tx.amount;
    else if (tx.type==="interest")  bal += tx.amount;
    dataPoints.push({date:new Date(tx.date), bal});
  });

  /* …(existing plotting code unchanged – omitted here for brevity)… */
  /* For the sake of space we skip re‑emitting the canvas drawing logic.
     Paste the original renderHistoryGraph body below this comment. */
}

/* ---------- Projection view ---------- */
function showProjection(){
  hideAllSections();
  document.getElementById("projection-section").style.display = "block";
  updateProjection();
}

function updateProjection(){
  if (!currentUser) return;

  const months  = +(document.getElementById("projection-months").value) || 12;
  const canvas  = document.getElementById("projection-graph");
  const ctx     = canvas.getContext("2d");
  ctx.clearRect(0,0,canvas.width,canvas.height);

  const {curBal,curRate} = computeInterestData(currentUser);
  const mRate   = Math.pow(1+curRate,1/12)-1;

  /* Build projection */
  const pts = [];
  let bal   = curBal;
  for (let m=0;m<=months;m++){
    pts.push({m,bal});
    bal += bal*mRate;
  }

  /* …(existing drawing code unchanged – like the original updateProjection)… */
  /* Again, to keep the file succinct, reuse your previous canvas code here. */
}

/* -----------------------------------------------------------------
 * Util
 * ----------------------------------------------------------------*/
function hideAllSections(){
  document.getElementById("balance-section"   ).style.display = "none";
  document.getElementById("history-section"   ).style.display = "none";
  document.getElementById("projection-section").style.display = "none";
}
