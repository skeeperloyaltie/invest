document.addEventListener("DOMContentLoaded", () => {
    const tableBody = document.getElementById("membersTable");
    const monthSelect = document.getElementById("monthSelect");
    const form = document.getElementById("bankingForm");
    const manageBtn = document.getElementById("manageMembersBtn");
    const updateRatesBtn = document.getElementById("updateRatesBtn");
    const addMemberBtn = document.getElementById("addMemberBtn");
    const membersList = document.getElementById("membersList");
    const membersModal = new bootstrap.Modal(document.getElementById("membersModal"));
    const updateModal = new bootstrap.Modal(document.getElementById("updateModal"));
    const deleteModal = new bootstrap.Modal(document.getElementById("deleteModal"));
    const addSharesModal = new bootstrap.Modal(document.getElementById("addSharesModal"));
    const updateRatesModal = new bootstrap.Modal(document.getElementById("updateRatesModal"));
    const addMemberModal = new bootstrap.Modal(document.getElementById("addMemberModal"));
    const summaryElements = {
        shares: document.getElementById("totalShares"),
        emergency: document.getElementById("totalEmergency"),
        loans: document.getElementById("totalLoans"),
        interest: document.getElementById("totalInterest"),
        penalties: document.getElementById("totalPenalties"),
        repayments: document.getElementById("totalRepayments"),
        accShares: document.getElementById("accShares"),
        accEmergency: document.getElementById("accEmergency"),
        accLoans: document.getElementById("accLoans"),
        accInterest: document.getElementById("accInterest"),
        accRepayments: document.getElementById("accRepayments")
    };

    let members = [];
    let interestRates = { share_loan_rate: 0.2, emergency_loan_rate: 0.1 };

    // Initialize
    loadMembers();
    monthSelect.addEventListener("change", () => {
        loadMembers();
        loadSummaries();
    });
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (validateForm()) {
            await handleSubmit();
            loadSummaries();
        }
    });

    // Load interest rates for the current month
    async function loadInterestRates() {
        const month = monthSelect.value;
        try {
            const res = await fetch(`/api/interest-rates/${month}`);
            if (res.ok) {
                interestRates = await res.json();
                const loanTypeSelects = document.querySelectorAll("#membersTable .loanType");
                loanTypeSelects.forEach(select => {
                    select.innerHTML = `
                        <option value="none">None</option>
                        <option value="share">Share Loan (${(interestRates.share_loan_rate * 100).toFixed(0)}%)</option>
                        <option value="emergency">Emergency Loan (${(interestRates.emergency_loan_rate * 100).toFixed(0)}%)</option>
                    `;
                });
                const validRows = Array.from(document.querySelectorAll("#membersTable tr")).filter(row =>
                    row.querySelector(".name") &&
                    row.querySelector(".shares") &&
                    row.querySelector(".emergencyLoan") &&
                    row.querySelector(".loan") &&
                    row.querySelector(".loanType") &&
                    row.querySelector(".repayment") &&
                    row.querySelector(".penalty")
                );
                validRows.forEach(calculateRow);
            } else {
                const error = await res.json();
                console.error("Failed to load interest rates:", error);
                alert(`Failed to load interest rates: ${error.error || 'Unknown error'}`);
            }
        } catch (e) {
            console.error("Error loading interest rates:", e);
            alert("Error loading interest rates: " + e.message);
        }
    }

    // Validate form before submission
    function validateForm() {
        const rows = Array.from(tableBody.querySelectorAll("tr")).filter(row =>
            row.querySelector(".name") && row.querySelector(".name").value
        );
        for (const row of rows) {
            const shares = parseFloat(row.querySelector(".shares").value) || 0;
            const loan = parseFloat(row.querySelector(".loan").value) || 0;
            const loanType = row.querySelector(".loanType").value;
            if (loanType === "share" && loan > 2 * shares) {
                alert(`Share Loan for ${row.querySelector(".name").value} cannot exceed 2× share capital (${(2 * shares).toFixed(2)})!`);
                row.querySelector(".loan").value = 0;
                calculateRow(row);
                return false;
            }
        }
        return true;
    }

    // Member management modal
    manageBtn.addEventListener("click", async () => {
        try {
            const res = await fetch("/api/members");
            if (!res.ok) {
                const error = await res.json();
                alert(`Failed to load members: ${error.error || 'Unknown error'}`);
                return;
            }
            const data = await res.json();
            membersList.innerHTML = "";
            data.forEach(m => {
                membersList.innerHTML += `
                    <tr>
                        <td>${m.id}</td>
                        <td>${m.name}</td>
                        <td>${m.shares.toFixed(2)}</td>
                        <td class="text-center">
                            <button class="btn btn-sm btn-success me-2" onclick="openUpdate(${m.id}, '${m.name}', ${m.shares})">✏️ Edit</button>
                            <button class="btn btn-sm btn-warning me-2" onclick="openAddShares(${m.id}, '${m.name}')">💰 Add Shares</button>
                            <button class="btn btn-sm btn-danger" onclick="openDelete(${m.id})">🗑️ Delete</button>
                        </td>
                    </tr>`;
            });
            membersModal.show();
        } catch (e) {
            alert("Error loading members: " + e.message);
        }
    });

    // Add member modal
    addMemberBtn.addEventListener("click", () => {
        document.getElementById("addMemberName").value = "";
        document.getElementById("addMemberShares").value = 0;
        document.getElementById("addMemberPassword").value = "";
        addMemberModal.show();
    });

    // Update interest rates modal
    updateRatesBtn.addEventListener("click", () => {
        document.getElementById("updateRatesMonth").value = monthSelect.value;
        document.getElementById("shareLoanRate").value = interestRates.share_loan_rate * 100;
        document.getElementById("emergencyLoanRate").value = interestRates.emergency_loan_rate * 100;
        document.getElementById("ratesPassword").value = "";
        updateRatesModal.show();
    });

    // Open update modal
    window.openUpdate = (id, name, shares) => {
        document.getElementById("updateMemberId").value = id;
        document.getElementById("updateName").value = name;
        document.getElementById("updateShares").value = shares;
        document.getElementById("updatePassword").value = "";
        updateModal.show();
    };

    // Open delete modal
    window.openDelete = (id) => {
        document.getElementById("deleteMemberId").value = id;
        document.getElementById("deletePassword").value = "";
        deleteModal.show();
    };

    // Open add shares modal
    window.openAddShares = (id, name) => {
        document.getElementById("addSharesMemberId").value = id;
        document.getElementById("addSharesAmount").value = "";
        document.getElementById("addSharesPassword").value = "";
        const addSharesMonth = document.getElementById("addSharesMonth");
        addSharesMonth.innerHTML = `
            <option value="March 2025">March 2025</option>
            <option value="April 2025">April 2025</option>
            <option value="May 2025">May 2025</option>
            <option value="June 2025">June 2025</option>
            <option value="July 2025">July 2025</option>
            <option value="August 2025">August 2025</option>
            <option value="September 2025">September 2025</option>
            <option value="October 2025">October 2025</option>
        `;
        addSharesMonth.value = monthSelect.value;
        addSharesModal.show();
    };

    // Add member
    document.getElementById("addMemberForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("addMemberName").value;
        const shares = parseFloat(document.getElementById("addMemberShares").value) || 0;
        const password = document.getElementById("addMemberPassword").value;

        try {
            const res = await fetch("/api/member/add", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, shares, password })
            });
            const data = await res.json();
            alert(data.message || data.error);
            if (res.ok) {
                addMemberModal.hide();
                manageBtn.click(); // Refresh member list
                loadMembers(); // Refresh main table
                loadSummaries();
            }
        } catch (e) {
            alert("Error adding member: " + e.message);
        }
    });

    // Update member
    document.getElementById("updateForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const id = document.getElementById("updateMemberId").value;
        const name = document.getElementById("updateName").value;
        const shares = parseFloat(document.getElementById("updateShares").value) || 0;
        const password = document.getElementById("updatePassword").value;

        try {
            const res = await fetch(`/api/member/update/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, shares, password })
            });
            const data = await res.json();
            alert(data.message || data.error);
            if (res.ok) {
                updateModal.hide();
                manageBtn.click(); // Refresh member list
                loadMembers(); // Refresh main table
            }
        } catch (e) {
            alert("Error updating member: " + e.message);
        }
    });

    // Delete member
    document.getElementById("deleteForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const id = document.getElementById("deleteMemberId").value;
        const password = document.getElementById("deletePassword").value;

        try {
            const res = await fetch(`/api/member/delete/${id}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password })
            });
            const data = await res.json();
            alert(data.message || data.error);
            if (res.ok) {
                deleteModal.hide();
                manageBtn.click(); // Refresh member list
                loadMembers(); // Refresh main table
            }
        } catch (e) {
            alert("Error deleting member: " + e.message);
        }
    });

    // Add shares
    document.getElementById("addSharesForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const member_id = document.getElementById("addSharesMemberId").value;
        const amount = parseFloat(document.getElementById("addSharesAmount").value) || 0;
        const month = document.getElementById("addSharesMonth").value;
        const password = document.getElementById("addSharesPassword").value;

        try {
            const res = await fetch(`/api/member/add-shares/${member_id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ amount, month, password })
            });
            const data = await res.json();
            alert(data.message || data.error);
            if (res.ok) {
                addSharesModal.hide();
                manageBtn.click(); // Refresh member list
                loadMembers(); // Refresh main table
                loadSummaries(); // Refresh summaries
            }
        } catch (e) {
            alert("Error adding shares: " + e.message);
        }
    });

    // Update interest rates
    document.getElementById("updateRatesForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const month = document.getElementById("updateRatesMonth").value;
        const shareLoanRate = parseFloat(document.getElementById("shareLoanRate").value) / 100 || 0;
        const emergencyLoanRate = parseFloat(document.getElementById("emergencyLoanRate").value) / 100 || 0;
        const password = document.getElementById("ratesPassword").value;

        try {
            const res = await fetch("/api/update-interest-rates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ month, shareLoanRate, emergencyLoanRate, password })
            });
            const data = await res.json();
            alert(data.message || data.error);
            if (res.ok) {
                updateRatesModal.hide();
                loadInterestRates(); // Refresh interest rates and recalculate
            }
        } catch (e) {
            alert("Error updating interest rates: " + e.message);
        }
    });

    // Load members and monthly data
    async function loadMembers() {
        tableBody.innerHTML = "";
        const month = monthSelect.value;

        try {
            // Load interest rates first
            await loadInterestRates();

            // Fetch members to get names and IDs
            const resMembers = await fetch("/api/members");
            if (!resMembers.ok) {
                const error = await resMembers.json();
                alert(`Failed to load members: ${error.error || 'Unknown error'}`);
                return;
            }
            members = await resMembers.json();

            if (month === "February 2025") {
                // For February 2025, allow adding new members with editable shares
                for (let i = 0; i < 8; i++) addRow();
                resetSummary();
            } else {
                if (members.length === 0) {
                    alert("No members found. Please add members using the Manage Members button.");
                    tableBody.innerHTML = "<tr><td colspan='12' class='text-center'>No members available. Add members to proceed.</td></tr>";
                    return;
                }
                // Add rows for each member with default shares
                members.forEach(m => addRow({ id: m.id, name: m.name, shares: 0 }));
                await prefillMonthlyData(month); // Fetch month-specific shares
                await loadPendingLoans(month);
                updateGroupSummary();
            }
        } catch (e) {
            console.error("Error loading members:", e);
            alert("Error loading members: " + e.message);
        }
    }

    // Add table row
    function addRow(member = null) {
        const row = document.createElement("tr");
        const name = member ? member.name : "";
        const shares = 0; // Default to 0; month-specific shares will be set by prefillMonthlyData
        const id = member ? member.id : null;
        row.dataset.memberId = id; // Store member ID in row for easier lookup
        row.innerHTML = `
            <td><input type="text" class="form-control name" value="${name}" ${monthSelect.value === "February 2025" ? "" : "readonly"}></td>
            <td><input type="number" class="form-control shares" value="${shares}" ${monthSelect.value === "February 2025" ? "" : "readonly"}></td>
            <td><input type="number" class="form-control emergency" value="200" readonly></td>
            <td><input type="number" class="form-control emergencyLoan" value="0"></td>
            <td><input type="number" class="form-control loan" value="0"></td>
            <td>
                <select class="form-select loanType">
                    <option value="none">None</option>
                    <option value="share">Share Loan (${(interestRates.share_loan_rate * 100).toFixed(0)}%)</option>
                    <option value="emergency">Emergency Loan (${(interestRates.emergency_loan_rate * 100).toFixed(0)}%)</option>
                </select>
            </td>
            <td><input type="text" class="form-control splitLabel" value="Main"></td>
            <td><input type="number" class="form-control repayment" value="0"></td>
            <td><input type="number" class="form-control penalty" value="0"></td>
            <td class="interest text-center">0</td>
            <td class="total text-center">0</td>
            <td class="due-loans text-center"></td>
        `;
        tableBody.appendChild(row);
    }

    // Load pending loans and display indicators
    async function loadPendingLoans(month) {
        try {
            const res = await fetch(`/api/active-loans/${month}`);
            if (!res.ok) {
                const error = await res.json();
                console.error("Failed to load pending loans:", error);
                return;
            }
            const loans = await res.json();
            loans.forEach(loan => {
                const row = [...tableBody.querySelectorAll("tr")].find(
                    r => r.querySelector(".name") && r.querySelector(".name").value === loan.name
                );
                if (row && loan.status === "Pending") {
                    const shares = parseFloat(row.querySelector(".shares").value) || 0;
                    if (loan.loan_type === "share" && loan.amount > 2 * shares) {
                        console.warn(`Pending loan for ${loan.name} exceeds 2× shares (${shares})`);
                        row.querySelector(".due-loans").innerHTML = `<span class="badge bg-danger">Invalid Loan: Exceeds 2× shares</span>`;
                    } else {
                        row.querySelector(".loan").value = loan.amount;
                        row.querySelector(".loanType").value = loan.loan_type;
                        row.querySelector(".due-loans").innerHTML = `<span class="badge bg-warning">Due: ${loan.due_month}</span>`;
                        row.classList.add("table-warning");
                    }
                    calculateRow(row);
                }
            });
        } catch (e) {
            console.error("Error loading pending loans:", e);
        }
    }

    // Prefill monthly data
    async function prefillMonthlyData(month) {
        try {
            const res = await fetch(`/api/monthly-data/${month}`);
            if (!res.ok) {
                const error = await res.json();
                console.error("Failed to load monthly data:", error);
                alert(`Failed to load monthly data: ${error.error || 'Unknown error'}`);
                return;
            }
            const records = await res.json();
            console.log("Monthly data:", records); // Debug: Log fetched records
            // Ensure all members have a row
            members.forEach(member => {
                const row = [...tableBody.querySelectorAll("tr")].find(
                    tr => tr.dataset.memberId == member.id
                );
                if (!row) {
                    addRow({ id: member.id, name: member.name, shares: 0 });
                }
            });
            // Update rows with monthly data
            records.forEach(r => {
                const row = [...tableBody.querySelectorAll("tr")].find(
                    tr => tr.dataset.memberId == r.id
                );
                if (row) {
                    row.querySelector(".shares").value = r.shares || 0;
                    row.querySelector(".emergencyLoan").value = r.emergency_loan || 0;
                    row.querySelector(".loan").value = r.loan || 0;
                    row.querySelector(".loanType").value = r.loan_type || "none";
                    row.querySelector(".repayment").value = r.repayment || 0;
                    row.querySelector(".penalty").value = r.penalty || 0;
                    row.querySelector(".interest").textContent = (r.interest || 0).toFixed(2);
                    row.querySelector(".total").textContent = (r.total || 0).toFixed(2);
                    row.querySelector(".splitLabel").value = r.split_label || "Main";
                    calculateRow(row); // Recalculate to ensure consistency
                }
            });
            // Validate loans after prefilling
            validateAllRows();
        } catch (e) {
            console.error("Error loading monthly data:", e);
            alert("Error loading monthly data: " + e.message);
        }
    }

    // Validate all rows for share loan limits
    function validateAllRows() {
        const rows = Array.from(tableBody.querySelectorAll("tr")).filter(row =>
            row.querySelector(".name") && row.querySelector(".name").value
        );
        rows.forEach(row => {
            const shares = parseFloat(row.querySelector(".shares").value) || 0;
            const loan = parseFloat(row.querySelector(".loan").value) || 0;
            const loanType = row.querySelector(".loanType").value;
            if (loanType === "share" && loan > 2 * shares) {
                alert(`Share Loan for ${row.querySelector(".name").value} exceeds 2× share capital (${(2 * shares).toFixed(2)})!`);
                row.querySelector(".loan").value = 0;
                calculateRow(row);
            }
        });
    }

    // Calculate row totals
    function calculateRow(row) {
        const sharesInput = row.querySelector(".shares");
        const loanInput = row.querySelector(".loan");
        const emergencyLoanInput = row.querySelector(".emergencyLoan");
        const repaymentInput = row.querySelector(".repayment");
        const penaltyInput = row.querySelector(".penalty");
        const loanTypeSelect = row.querySelector(".loanType");
        const interestCell = row.querySelector(".interest");
        const totalCell = row.querySelector(".total");

        if (!sharesInput || !loanInput || !emergencyLoanInput || !repaymentInput || !penaltyInput || !loanTypeSelect || !interestCell || !totalCell) {
            console.warn("Skipping row calculation: Missing required elements", row);
            return;
        }

        const shares = parseFloat(sharesInput.value) || 0;
        const loan = parseFloat(loanInput.value) || 0;
        const emergencyLoan = parseFloat(emergencyLoanInput.value) || 0;
        const repayment = parseFloat(repaymentInput.value) || 0;
        const penalty = parseFloat(penaltyInput.value) || 0;
        const loanType = loanTypeSelect.value;

        if (loanType === "share" && loan > 2 * shares) {
            alert(`Share Loan for ${row.querySelector(".name").value} cannot exceed 2× share capital (${(2 * shares).toFixed(2)})!`);
            loanInput.value = 0;
            return;
        }

        const interestRate = loanType === "share" ? interestRates.share_loan_rate : loanType === "emergency" ? interestRates.emergency_loan_rate : 0;
        const interest = loanType === "none" ? 0 : (loanType === "share" ? loan : emergencyLoan) * interestRate;
        const total = loan + emergencyLoan + interest + penalty - repayment;

        interestCell.textContent = interest.toFixed(2);
        totalCell.textContent = total.toFixed(2);
        updateGroupSummary();
    }

    // Handle input changes
    tableBody.addEventListener("input", (e) => {
        if (["loan", "emergencyLoan", "repayment", "penalty", "loanType"].includes(e.target.className.split(" ")[1])) {
            calculateRow(e.target.closest("tr"));
        }
    });

    // Handle form submission
    async function handleSubmit() {
        const month = monthSelect.value;
        const rows = Array.from(tableBody.querySelectorAll("tr")).filter(row =>
            row.querySelector(".name") && row.querySelector(".name").value
        );
        const data = rows.map(row => ({
            id: row.dataset.memberId,
            name: row.querySelector(".name").value,
            shares: parseFloat(row.querySelector(".shares").value) || 0,
            emergencyLoan: parseFloat(row.querySelector(".emergencyLoan").value) || 0,
            loan: parseFloat(row.querySelector(".loan").value) || 0,
            loanType: row.querySelector(".loanType").value,
            splitLabel: row.querySelector(".splitLabel").value,
            repayment: parseFloat(row.querySelector(".repayment").value) || 0,
            penalty: parseFloat(row.querySelector(".penalty").value) || 0,
            interest: parseFloat(row.querySelector(".interest").textContent) || 0,
            total: parseFloat(row.querySelector(".total").textContent) || 0
        }));

        const endpoint = month === "February 2025" ? "/api/init-february" : "/api/save";
        try {
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ month, members: data })
            });
            const msg = await res.json();
            alert(res.ok ? msg.message : msg.error);
            if (res.ok) {
                loadMembers(); // Refresh table to reflect saved data
            }
        } catch (e) {
            alert("Error saving data: " + e.message);
        }
    }

    // Update group summary
    function updateGroupSummary() {
        const rows = Array.from(tableBody.querySelectorAll("tr")).filter(row =>
            row.querySelector(".name") && row.querySelector(".shares")
        );
        let totals = { shares: 0, emergency: 0, loans: 0, interest: 0, penalties: 0, repayments: 0 };

        rows.forEach(row => {
            totals.shares += parseFloat(row.querySelector(".shares").value) || 0;
            totals.emergency += parseFloat(row.querySelector(".emergencyLoan").value) || 0;
            totals.loans += parseFloat(row.querySelector(".loan").value) || 0;
            totals.interest += parseFloat(row.querySelector(".interest").textContent) || 0;
            totals.repayments += parseFloat(row.querySelector(".repayment").value) || 0;
            totals.penalties += parseFloat(row.querySelector(".penalty").value) || 0;
        });

        summaryElements.shares.textContent = totals.shares.toFixed(2);
        summaryElements.emergency.textContent = totals.emergency.toFixed(2);
        summaryElements.loans.textContent = totals.loans.toFixed(2);
        summaryElements.interest.textContent = totals.interest.toFixed(2);
        summaryElements.penalties.textContent = totals.penalties.toFixed(2);
        summaryElements.repayments.textContent = totals.repayments.toFixed(2);
    }

    // Load summaries
    async function loadSummaries() {
        const month = monthSelect.value;
        document.getElementById("monthLabel").textContent = month;

        try {
            const resMonth = await fetch(`/api/summary/${month}`);
            if (resMonth.ok) {
                const data = await resMonth.json();
                summaryElements.shares.textContent = data.shares.toFixed(2);
                summaryElements.emergency.textContent = data.emergency_loan.toFixed(2);
                summaryElements.loans.textContent = data.loan.toFixed(2);
                summaryElements.interest.textContent = data.interest.toFixed(2);
                summaryElements.repayments.textContent = data.repayment.toFixed(2);
                summaryElements.penalties.textContent = data.penalty.toFixed(2);
            } else {
                const error = await resMonth.json();
                console.error(`Failed to load summary for ${month}:`, error);
            }

            const resTotal = await fetch("/api/summary/total");
            if (resTotal.ok) {
                const data = await resTotal.json();
                summaryElements.accShares.textContent = data.total_shares.toFixed(2);
                summaryElements.accEmergency.textContent = data.total_emergency_loans.toFixed(2);
                summaryElements.accLoans.textContent = data.total_loans.toFixed(2);
                summaryElements.accInterest.textContent = data.total_interest.toFixed(2);
                summaryElements.accRepayments.textContent = data.total_repayments.toFixed(2);
            } else {
                const error = await resTotal.json();
                console.error("Failed to load total summary:", error);
            }
        } catch (e) {
            console.error("Error loading summaries:", e);
        }
    }

    // Reset summary
    function resetSummary() {
        Object.values(summaryElements).forEach(el => el.textContent = "0.00");
    }
});