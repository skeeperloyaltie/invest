document.addEventListener("DOMContentLoaded", () => {
  const tableBody = document.getElementById("membersTable");
  const monthSelect = document.getElementById("monthSelect");
  const form = document.getElementById("bankingForm");

  // Totals summary elements
  const totalShares = document.getElementById("totalShares");
  const totalEmergency = document.getElementById("totalEmergency");
  const totalLoans = document.getElementById("totalLoans");
  const totalInterest = document.getElementById("totalInterest");
  const totalRepayments = document.getElementById("totalRepayments");

  let members = [];

  // Initialize
  loadMembers();

monthSelect.addEventListener("change", () => {
  loadMembers();
  loadSummaries();
});  

form.addEventListener("submit", async (e) => {
  await handleSubmit(e);
  loadSummaries();
});
  // --- Load Members or Monthly Data ---
  async function loadMembers() {
    tableBody.innerHTML = "";
    const month = monthSelect.value;

    if (month === "February 2025") {
      for (let i = 0; i < 8; i++) addRow();
      resetSummary();
    } else {
      const res = await fetch("/api/members");
      members = await res.json();
      members.forEach(m => addRow(m));

      // Prefill saved month data if it exists
      await prefillMonthlyData(month);
      await loadPendingRepayments(month);
      updateGroupSummary();
    }
  }

  // --- Add Row for Member ---
  function addRow(member = null) {
    const row = document.createElement("tr");
    const name = member ? member.name : "";
    const shares = member ? member.shares : 5000;

    row.innerHTML = `
      <td><input type="text" class="form-control name" value="${name}" ${member ? "readonly" : ""}></td>
      <td><input type="number" class="form-control shares" value="${shares}" ${member ? "readonly" : ""}></td>
      <td><input type="number" class="form-control emergency" value="200"></td>
      <td><input type="number" class="form-control loan" value="0"></td>
      <td>
        <select class="form-select loanType">
          <option value="none">None</option>
          <option value="share">Share Loan (20%)</option>
          <option value="emergency">Emergency Loan (10%)</option>
        </select>
      </td>
      <td><input type="number" class="form-control repayment" value="0"></td>
      <td class="interest text-center">0</td>
      <td class="total text-center">0</td>
    `;
    tableBody.appendChild(row);
  }

  // --- Load Pending Loans for this Month ---
  async function loadPendingRepayments(month) {
    const res = await fetch(`/api/active-loans/${month}`);
    const loans = await res.json();

    loans.forEach(l => {
      const row = [...document.querySelectorAll("#membersTable tr")].find(r =>
        r.querySelector(".name").value === l.name
      );
      if (row && l.status === "Pending") {
        row.querySelector(".loan").value = l.amount;
        row.querySelector(".loanType").value = "share";
        calculateRow(row);
        row.classList.add("table-warning");
        row.title = `Pending repayment from February (due ${l.due_month})`;
      }
    });
  }

  // --- Prefill Month Data if Exists ---
  async function prefillMonthlyData(month) {
    const res = await fetch(`/api/monthly-data/${month}`);
    if (!res.ok) return;
    const records = await res.json();
    records.forEach(r => {
      const row = [...document.querySelectorAll("#membersTable tr")].find(
        tr => tr.querySelector(".name").value === r.name
      );
      if (row) {
        row.querySelector(".emergency").value = r.emergency;
        row.querySelector(".loan").value = r.loan;
        row.querySelector(".loanType").value = r.loan_type;
        row.querySelector(".repayment").value = r.repayment;
        row.querySelector(".interest").textContent = r.interest;
        row.querySelector(".total").textContent = r.total;
      }
    });
  }

  // --- Calculate Row ---
  function calculateRow(row) {
    const shares = parseFloat(row.querySelector(".shares").value) || 0;
    const loan = parseFloat(row.querySelector(".loan").value) || 0;
    const repayment = parseFloat(row.querySelector(".repayment").value) || 0;
    const type = row.querySelector(".loanType").value;

    if (loan > 2 * shares) {
      alert("⚠️ Loan cannot exceed 2× share capital!");
      row.querySelector(".loan").value = 0;
      return;
    }

    let interestRate = 0;
    if (type === "share") interestRate = 0.2;
    if (type === "emergency") interestRate = 0.1;

    const interest = loan * interestRate;
    const total = loan + interest - repayment;

    row.querySelector(".interest").textContent = interest.toFixed(2);
    row.querySelector(".total").textContent = total.toFixed(2);
    updateGroupSummary();
  }

  tableBody.addEventListener("input", e => {
    if (
      ["loan", "repayment", "loanType"].some(cls =>
        e.target.classList.contains(cls)
      )
    ) {
      const row = e.target.closest("tr");
      calculateRow(row);
    }
  });

  // --- Handle Form Submit ---
  async function handleSubmit(e) {
    e.preventDefault();
    const month = monthSelect.value;
    const rows = Array.from(document.querySelectorAll("#membersTable tr"));

    if (month === "February 2025") {
      const data = rows.map(r => ({
        name: r.querySelector(".name").value,
        shares: parseFloat(r.querySelector(".shares").value) || 0
      }));
      await fetch("/api/init-february", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ members: data })
      });
      alert("✅ February members saved!");
    } else {
      const data = rows.map((r, i) => ({
        id: members[i].id,
        name: members[i].name,
        loan: parseFloat(r.querySelector(".loan").value) || 0,
        loanType: r.querySelector(".loanType").value,
        emergency: parseFloat(r.querySelector(".emergency").value) || 0,
        repayment: parseFloat(r.querySelector(".repayment").value) || 0,
        interest: parseFloat(r.querySelector(".interest").textContent) || 0,
        total: parseFloat(r.querySelector(".total").textContent) || 0
      }));

      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, members: data })
      });
      const msg = await res.json();
      alert(msg.message || msg.error);
      if (res.ok) updateGroupSummary();
    }
  }

  // --- Calculate Group Summary ---
  function updateGroupSummary() {
    const rows = document.querySelectorAll("#membersTable tr");
    let totalS = 0, totalE = 0, totalL = 0, totalI = 0, totalR = 0;

    rows.forEach(row => {
      totalS += parseFloat(row.querySelector(".shares").value) || 0;
      totalE += parseFloat(row.querySelector(".emergency").value) || 0;
      totalL += parseFloat(row.querySelector(".loan").value) || 0;
      totalI += parseFloat(row.querySelector(".interest").textContent) || 0;
      totalR += parseFloat(row.querySelector(".repayment").value) || 0;
    });

    totalShares.textContent = totalS.toFixed(2);
    totalEmergency.textContent = totalE.toFixed(2);
    totalLoans.textContent = totalL.toFixed(2);
    totalInterest.textContent = totalI.toFixed(2);
    totalRepayments.textContent = totalR.toFixed(2);
  }
  // --- Load Monthly & Total Summary ---
async function loadSummaries() {
  const month = monthSelect.value;
  document.getElementById("monthLabel").textContent = month;

  // Monthly summary
  const resMonth = await fetch(`/api/summary/${month}`);
  const monthData = await resMonth.json();
  document.getElementById("totalEmergency").textContent = monthData.emergency.toFixed(2);
  document.getElementById("totalLoans").textContent = monthData.loan.toFixed(2);
  document.getElementById("totalInterest").textContent = monthData.interest.toFixed(2);
  document.getElementById("totalRepayments").textContent = monthData.repayment.toFixed(2);

  // Total accumulative summary
  const resTotal = await fetch(`/api/summary/total`);
  const totalData = await resTotal.json();
  document.getElementById("accShares").textContent = totalData.total_shares.toFixed(2);
  document.getElementById("accEmergency").textContent = totalData.total_emergency.toFixed(2);
  document.getElementById("accLoans").textContent = totalData.total_loans.toFixed(2);
  document.getElementById("accInterest").textContent = totalData.total_interest.toFixed(2);
  document.getElementById("accRepayments").textContent = totalData.total_repayments.toFixed(2);
}


  function resetSummary() {
    totalShares.textContent = "0";
    totalEmergency.textContent = "0";
    totalLoans.textContent = "0";
    totalInterest.textContent = "0";
    totalRepayments.textContent = "0";
  }
});
