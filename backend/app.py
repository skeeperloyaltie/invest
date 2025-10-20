from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import psycopg2
import datetime

app = Flask(__name__)
CORS(app)

# -------------------------------
# Database Connection
# -------------------------------
conn = psycopg2.connect(
    dbname="investandgrow",
    user="skeeperloyaltie",
    password="1391",
    host="localhost",
    port="5432"
)
cur = conn.cursor()

# -------------------------------
# Auto-create Tables
# -------------------------------
def create_tables():
    cur.execute("""
        CREATE TABLE IF NOT EXISTS members (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) UNIQUE NOT NULL,
            shares NUMERIC DEFAULT 0
        );
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS monthly_records (
            id SERIAL PRIMARY KEY,
            member_id INTEGER REFERENCES members(id),
            month VARCHAR(50),
            emergency NUMERIC DEFAULT 0,
            loan NUMERIC DEFAULT 0,
            loan_type VARCHAR(20),
            repayment NUMERIC DEFAULT 0,
            interest NUMERIC DEFAULT 0,
            total NUMERIC DEFAULT 0,
            remarks TEXT
        );
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS loan_repayments (
            id SERIAL PRIMARY KEY,
            member_id INTEGER REFERENCES members(id),
            month_issued VARCHAR(50),
            amount NUMERIC,
            interest NUMERIC,
            due_month VARCHAR(50),
            status VARCHAR(20) DEFAULT 'Pending',
            remarks TEXT
        );
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS share_additions (
            id SERIAL PRIMARY KEY,
            member_id INTEGER REFERENCES members(id),
            amount NUMERIC NOT NULL,
            month VARCHAR(50),
            date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.commit()

create_tables()

# -------------------------------
# Routes
# -------------------------------

@app.route("/")
def index():
    return render_template("index.html")


# ✅ Get all members
@app.route("/api/members", methods=["GET"])
def get_members():
    cur.execute("SELECT id, name, shares FROM members ORDER BY id ASC")
    rows = cur.fetchall()
    members = [{"id": r[0], "name": r[1], "shares": float(r[2])} for r in rows]
    return jsonify(members)


# ✅ Save Monthly Data (with restriction for past months)
@app.route("/api/save", methods=["POST"])
def save_monthly_data():
    data = request.json
    month = data.get("month")
    members = data.get("members", [])

    current_month = datetime.datetime.now().strftime("%B %Y")
    months_order = [
        "January 2025", "February 2025", "March 2025", "April 2025",
        "May 2025", "June 2025", "July 2025", "August 2025",
        "September 2025", "October 2025", "November 2025", "December 2025"
    ]

    if month not in months_order:
        return jsonify({"error": "Invalid month format"}), 400

    if months_order.index(month) < months_order.index(current_month):
        return jsonify({"error": "Cannot add data for past months."}), 400

    for m in members:
        member_id = m.get("id")
        loan = float(m.get("loan", 0))
        loan_type = m.get("loanType")
        repayment = float(m.get("repayment", 0))
        emergency = float(m.get("emergency", 0))
        interest = float(m.get("interest", 0))
        total = float(m.get("total", 0))

        cur.execute("SELECT shares FROM members WHERE id=%s", (member_id,))
        result = cur.fetchone()
        if not result:
            continue
        share_capital = result[0]

        if loan > (2 * share_capital):
            return jsonify({"error": f"{m['name']} exceeds loan limit (max {2 * share_capital})"}), 400

        cur.execute("""
            INSERT INTO monthly_records (member_id, month, emergency, loan, loan_type, repayment, interest, total)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (member_id, month, emergency, loan, loan_type, repayment, interest, total))

        if repayment > 0:
            cur.execute("""
                UPDATE loan_repayments
                SET status='Paid'
                WHERE member_id=%s AND due_month=%s
            """, (member_id, month))

    conn.commit()
    return jsonify({"message": f"Data saved successfully for {month}"}), 200


# ✅ Register Repayment Helper
def register_loan_for_repayment(member_id, loan, interest, issued_month, due_months, remarks=""):
    for due in due_months:
        cur.execute("""
            INSERT INTO loan_repayments (member_id, month_issued, amount, interest, due_month, remarks)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (member_id, issued_month, loan, interest, due, remarks))
    conn.commit()


# ✅ Handle February Share Loans
def handle_february_share_loans(members):
    for m in members:
        name = m["name"]
        shares = float(m.get("shares", 0))

        if shares < 5000:
            loan = 5000.0
            interest = loan * 0.2
            remarks = "Auto-issued share loan for missing share capital (Feb 2025). Interest paid upfront."

            cur.execute("""
                INSERT INTO monthly_records 
                (member_id, month, emergency, loan, loan_type, repayment, interest, total, remarks)
                VALUES (
                    (SELECT id FROM members WHERE name=%s),
                    %s, 200, %s, 'share', 0, %s, %s, %s
                )
            """, (name, "February 2025", loan, interest, loan + interest, remarks))

            cur.execute("SELECT id FROM members WHERE name=%s", (name,))
            member_id = cur.fetchone()[0]
            register_loan_for_repayment(
                member_id, loan, interest, "February 2025",
                ["March 2025", "April 2025"],
                "Two-month repayment for February share loan"
            )
    conn.commit()


# ✅ Initialize February
@app.route("/api/init-february", methods=["POST"])
def init_february():
    data = request.json
    members = data.get("members", [])
    for m in members:
        cur.execute("""
            INSERT INTO members (name, shares)
            VALUES (%s, %s)
            ON CONFLICT (name) DO UPDATE SET shares = EXCLUDED.shares
        """, (m["name"], m["shares"]))
    conn.commit()

    handle_february_share_loans(members)
    return jsonify({"message": "February setup complete — share loans handled"}), 200


# ✅ Get Active Loans
@app.route("/api/active-loans/<month>", methods=["GET"])
def get_active_loans(month):
    cur.execute("""
        SELECT m.id, m.name, l.amount, l.due_month, l.status
        FROM loan_repayments l
        JOIN members m ON m.id = l.member_id
        WHERE l.due_month=%s
    """, (month,))
    loans = cur.fetchall()
    return jsonify([
        {"id": l[0], "name": l[1], "amount": float(l[2]), "due_month": l[3], "status": l[4]}
        for l in loans
    ])


# ✅ Secure Member Update
@app.route("/api/member/update/<int:member_id>", methods=["PUT"])
def update_member(member_id):
    data = request.json
    name = data.get("name")
    shares = data.get("shares")
    password = data.get("password")

    if password != "admin123":
        return jsonify({"error": "Invalid password"}), 403

    cur.execute("UPDATE members SET name=%s, shares=%s WHERE id=%s", (name, shares, member_id))
    conn.commit()
    return jsonify({"message": "Member updated successfully"}), 200


# ✅ Secure Member Delete
@app.route("/api/member/delete/<int:member_id>", methods=["DELETE"])
def delete_member(member_id):
    data = request.json
    password = data.get("password")

    if password != "admin123":
        return jsonify({"error": "Invalid password"}), 403

    cur.execute("DELETE FROM monthly_records WHERE member_id=%s", (member_id,))
    cur.execute("DELETE FROM loan_repayments WHERE member_id=%s", (member_id,))
    cur.execute("DELETE FROM members WHERE id=%s", (member_id,))
    conn.commit()
    return jsonify({"message": f"Member {member_id} deleted successfully"}), 200


# ✅ Monthly Summary
@app.route("/api/summary/<month>", methods=["GET"])
def monthly_summary(month):
    cur.execute("""
        SELECT 
            COALESCE(SUM(emergency), 0),
            COALESCE(SUM(loan), 0),
            COALESCE(SUM(interest), 0),
            COALESCE(SUM(repayment), 0)
        FROM monthly_records
        WHERE month=%s
    """, (month,))
    e, l, i, r = cur.fetchone()
    return jsonify({
        "month": month,
        "emergency": float(e),
        "loan": float(l),
        "interest": float(i),
        "repayment": float(r)
    })


# ✅ Total Summary
@app.route("/api/summary/total", methods=["GET"])
def total_summary():
    cur.execute("""
        SELECT 
            COALESCE(SUM(emergency), 0),
            COALESCE(SUM(loan), 0),
            COALESCE(SUM(interest), 0),
            COALESCE(SUM(repayment), 0)
        FROM monthly_records
    """)
    e, l, i, r = cur.fetchone()

    cur.execute("SELECT COALESCE(SUM(shares), 0) FROM members")
    total_shares = cur.fetchone()[0]

    return jsonify({
        "total_shares": float(total_shares),
        "total_emergency": float(e),
        "total_loans": float(l),
        "total_interest": float(i),
        "total_repayments": float(r)
    })


# ✅ Add Shares (any time)
@app.route("/api/member/add-shares/<int:member_id>", methods=["POST"])
def add_shares(member_id):
    data = request.json
    amount = float(data.get("amount", 0))
    month = data.get("month")
    password = data.get("password")

    if password != "admin123":
        return jsonify({"error": "Invalid password"}), 403
    if amount <= 0:
        return jsonify({"error": "Share amount must be greater than 0"}), 400

    cur.execute("UPDATE members SET shares = shares + %s WHERE id=%s", (amount, member_id))
    cur.execute("""
        INSERT INTO share_additions (member_id, amount, month)
        VALUES (%s, %s, %s)
    """, (member_id, amount, month))
    conn.commit()
    return jsonify({"message": f"Ksh {amount} added for member {member_id}"}), 200


# -------------------------------
# Run App
# -------------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
