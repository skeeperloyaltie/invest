from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import psycopg2
from datetime import datetime, timedelta

app = Flask(__name__)
CORS(app)

# Database Connection
def get_db():
    return psycopg2.connect(
        dbname="investandgrow",
        user="postgres",
        password="1391",
        host="localhost",
        port="5432"
    )

conn = get_db()
cur = conn.cursor()

# Create Tables
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
            shares NUMERIC DEFAULT 0,
            loan NUMERIC DEFAULT 0,
            emergency_loan NUMERIC DEFAULT 0,
            loan_type VARCHAR(30) DEFAULT 'none',
            interest NUMERIC DEFAULT 0,
            repayment NUMERIC DEFAULT 0,
            penalty NUMERIC DEFAULT 0,
            total NUMERIC DEFAULT 0,
            split_label VARCHAR(50) DEFAULT 'Main',
            UNIQUE (member_id, month)
        );
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS loan_repayments (
            id SERIAL PRIMARY KEY,
            member_id INTEGER REFERENCES members(id),
            amount NUMERIC,
            interest NUMERIC,
            loan_type VARCHAR(30),
            month_issued VARCHAR(50),
            due_month VARCHAR(50),
            status VARCHAR(20) DEFAULT 'Pending'
        );
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS interest_rates (
            id SERIAL PRIMARY KEY,
            month VARCHAR(50) UNIQUE,
            share_loan_rate NUMERIC DEFAULT 0.2,
            emergency_loan_rate NUMERIC DEFAULT 0.1
        );
    """)
    conn.commit()

# Drop and recreate tables for clean initialization
def drop_tables():
    cur.execute("DROP TABLE IF EXISTS interest_rates;")
    cur.execute("DROP TABLE IF EXISTS loan_repayments;")
    cur.execute("DROP TABLE IF EXISTS monthly_records;")
    cur.execute("DROP TABLE IF EXISTS members;")
    conn.commit()

# Uncomment to reset database (optional)
# drop_tables()
create_tables()

# Routes
@app.route("/")
def index():
    return render_template("index.html")

# Get all members
@app.route("/api/members", methods=["GET"])
def get_members():
    try:
        cur.execute("SELECT id, name, shares FROM members ORDER BY id")
        rows = cur.fetchall()
        members = [{"id": r[0], "name": r[1], "shares": float(r[2])} for r in rows]
        return jsonify(members)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Add new member
@app.route("/api/member/add", methods=["POST"])
def add_member():
    data = request.json
    name = data.get("name")
    shares = float(data.get("shares", 0))
    password = data.get("password")
    
    if password != "admin123":
        return jsonify({"error": "Invalid password"}), 403
    if not name or shares < 0:
        return jsonify({"error": "Invalid name or shares"}), 400
    
    try:
        cur.execute("INSERT INTO members (name, shares) VALUES (%s, %s) RETURNING id", (name, shares))
        member_id = cur.fetchone()[0]
        
        all_months = [
            "February 2025", "March 2025", "April 2025", "May 2025", "June 2025",
            "July 2025", "August 2025", "September 2025", "October 2025"
        ]
        for month in all_months:
            cur.execute("""
                INSERT INTO monthly_records (member_id, month, shares, split_label)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (member_id, month) DO NOTHING
            """, (member_id, month, shares, "Main"))
        
        conn.commit()
        return jsonify({"message": f"Member {name} added with Ksh {shares} shares"}), 200
    except psycopg2.IntegrityError:
        conn.rollback()
        return jsonify({"error": "Member name already exists"}), 400
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500

# Initialize February 2025 data
@app.route("/api/init-february", methods=["POST"])
def init_february():
    data = request.json
    members = data.get("members", [])
    
    try:
        for member in members:
            name = member.get("name")
            shares = float(member.get("shares", 0))
            loan = float(member.get("loan", 0))
            loan_type = member.get("loanType", "none")
            interest = float(member.get("interest", 0))
            
            # Validate share loan
            if loan_type == "share" and loan > 2 * shares:
                return jsonify({"error": f"Share loan for {name} exceeds 2× share capital ({2 * shares})"}), 400
            
            cur.execute("INSERT INTO members (name, shares) VALUES (%s, %s) ON CONFLICT (name) DO UPDATE SET shares = EXCLUDED.shares RETURNING id", (name, shares))
            member_id = cur.fetchone()[0]
            
            if loan > 0:
                months = 5 if loan > 30000 else 2
                due_month = (datetime(2025, 2, 1) + timedelta(days=30 * months)).strftime("%B %Y")
                cur.execute("""
                    INSERT INTO loan_repayments (member_id, amount, interest, loan_type, month_issued, due_month)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (member_id, loan, interest, loan_type, "February 2025", due_month))
            
            cur.execute("""
                INSERT INTO monthly_records (member_id, month, shares, loan, loan_type, interest, total)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (member_id, month) DO UPDATE SET
                    shares = EXCLUDED.shares,
                    loan = EXCLUDED.loan,
                    loan_type = EXCLUDED.loan_type,
                    interest = EXCLUDED.interest,
                    total = EXCLUDED.total
            """, (member_id, "February 2025", shares, loan, loan_type, interest, loan + interest))
        
        conn.commit()
        return jsonify({"message": "February 2025 initialized"}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500

# Save monthly records
@app.route("/api/save", methods=["POST"])
def save_monthly_data():
    data = request.json
    month = data.get("month")
    members = data.get("members", [])
    
    interest_rates = get_interest_rates(month)
    share_loan_rate = interest_rates["share_loan_rate"]
    emergency_loan_rate = interest_rates["emergency_loan_rate"]
    
    try:
        for m in members:
            member_id = m.get("id")
            shares = float(m.get("shares", 0))
            loan = float(m.get("loan", 0))
            emergency_loan = float(m.get("emergencyLoan", 0))
            loan_type = m.get("loanType", "none")
            repayment = float(m.get("repayment", 0))
            penalty = float(m.get("penalty", 0))
            split_label = m.get("splitLabel", "Main")
            
            # Validate share loan
            if loan_type == "share" and loan > 2 * shares:
                return jsonify({"error": f"Share loan for member ID {member_id} exceeds 2× share capital ({2 * shares})"}), 400
            
            interest_rate = share_loan_rate if loan_type == "share" else emergency_loan_rate if loan_type == "emergency" else 0
            interest = 0 if loan_type == "none" else (loan if loan_type == "share" else emergency_loan) * interest_rate
            total = loan + emergency_loan + interest + penalty - repayment
            
            cur.execute("""
                INSERT INTO monthly_records
                (member_id, month, shares, loan, emergency_loan, loan_type, repayment, interest, penalty, total, split_label)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (member_id, month) DO UPDATE SET
                    shares = EXCLUDED.shares,
                    loan = EXCLUDED.loan,
                    emergency_loan = EXCLUDED.emergency_loan,
                    loan_type = EXCLUDED.loan_type,
                    repayment = EXCLUDED.repayment,
                    interest = EXCLUDED.interest,
                    penalty = EXCLUDED.penalty,
                    total = EXCLUDED.total,
                    split_label = EXCLUDED.split_label
            """, (member_id, month, shares, loan, emergency_loan, loan_type, repayment, interest, penalty, total, split_label))
            
            if loan > 0 or emergency_loan > 0:
                amount = loan if loan_type == "share" else emergency_loan
                months = 5 if amount > 30000 else 2
                due_date = (datetime.strptime(month, "%B %Y") + timedelta(days=30 * months)).strftime("%B %Y")
                cur.execute("""
                    INSERT INTO loan_repayments (member_id, amount, interest, loan_type, month_issued, due_month)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (member_id, amount, interest, loan_type, month, due_date))
            
            if repayment > 0:
                cur.execute("""
                    UPDATE loan_repayments SET status = 'Paid', amount = amount - %s
                    WHERE member_id = %s AND month_issued <= %s AND status = 'Pending'
                """, (repayment, member_id, month))
        
        conn.commit()
        return jsonify({"message": f"Records saved for {month}"}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500

# Get monthly data
@app.route("/api/monthly-data/<month>", methods=["GET"])
def get_monthly_data(month):
    try:
        cur.execute("""
            SELECT m.id, m.name, mr.shares, mr.loan, mr.emergency_loan, mr.loan_type, mr.repayment, mr.interest, mr.penalty, mr.total, mr.split_label
            FROM monthly_records mr
            JOIN members m ON mr.member_id = m.id
            WHERE mr.month = %s
        """, (month,))
        rows = cur.fetchall()
        data = [{
            "id": r[0],
            "name": r[1],
            "shares": float(r[2]) if r[2] is not None else 0,
            "loan": float(r[3]) if r[3] is not None else 0,
            "emergency_loan": float(r[4]) if r[4] is not None else 0,
            "loan_type": r[5] or "none",
            "repayment": float(r[6]) if r[6] is not None else 0,
            "interest": float(r[7]) if r[7] is not None else 0,
            "penalty": float(r[8]) if r[8] is not None else 0,
            "total": float(r[9]) if r[9] is not None else 0,
            "split_label": r[10] or "Main"
        } for r in rows]
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Get active loans
@app.route("/api/active-loans/<month>", methods=["GET"])
def get_active_loans(month):
    try:
        cur.execute("""
            SELECT m.name, lr.amount, lr.loan_type, lr.month_issued, lr.due_month, lr.status
            FROM loan_repayments lr
            JOIN members m ON lr.member_id = m.id
            WHERE lr.status = 'Pending' AND lr.month_issued <= %s
        """, (month,))
        rows = cur.fetchall()
        loans = [{"name": r[0], "amount": float(r[1]), "loan_type": r[2], "month_issued": r[3], "due_month": r[4], "status": r[5]} for r in rows]
        return jsonify(loans)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Monthly summary
@app.route("/api/summary/<month>", methods=["GET"])
def monthly_summary(month):
    try:
        cur.execute("""
            SELECT COALESCE(SUM(shares), 0), COALESCE(SUM(loan), 0), COALESCE(SUM(emergency_loan), 0),
                   COALESCE(SUM(interest), 0), COALESCE(SUM(repayment), 0), COALESCE(SUM(penalty), 0)
            FROM monthly_records WHERE month = %s
        """, (month,))
        s, l, e, i, r, p = cur.fetchone()
        return jsonify({
            "shares": float(s), "loan": float(l), "emergency_loan": float(e),
            "interest": float(i), "repayment": float(r), "penalty": float(p)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Total summary
@app.route("/api/summary/total", methods=["GET"])
def total_summary():
    try:
        cur.execute("SELECT COALESCE(SUM(shares), 0) FROM members")
        total_shares = float(cur.fetchone()[0])
        
        cur.execute("""
            SELECT COALESCE(SUM(loan), 0), COALESCE(SUM(emergency_loan), 0),
                   COALESCE(SUM(interest), 0), COALESCE(SUM(repayment), 0), COALESCE(SUM(penalty), 0)
            FROM monthly_records
        """)
        l, e, i, r, p = cur.fetchone()
        return jsonify({
            "total_shares": total_shares,
            "total_loans": float(l),
            "total_emergency_loans": float(e),
            "total_interest": float(i),
            "total_repayments": float(r),
            "total_penalties": float(p)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Get interest rates for a specific month
def get_interest_rates(month):
    all_months = [
        "February 2025", "March 2025", "April 2025", "May 2025", "June 2025",
        "July 2025", "August 2025", "September 2025", "October 2025"
    ]
    month_index = all_months.index(month)
    
    try:
        cur.execute("""
            SELECT share_loan_rate, emergency_loan_rate
            FROM interest_rates
            WHERE month IN %s
            ORDER BY array_position(%s::text[], month) DESC
            LIMIT 1
        """, (tuple(all_months[:month_index + 1]), all_months))
        result = cur.fetchone()
        return {
            "share_loan_rate": float(result[0]) if result else 0.2,
            "emergency_loan_rate": float(result[1]) if result else 0.1
        }
    except Exception as e:
        return {"share_loan_rate": 0.2, "emergency_loan_rate": 0.1}

# Update interest rates
@app.route("/api/update-interest-rates", methods=["POST"])
def update_interest_rates():
    data = request.json
    month = data.get("month")
    share_loan_rate = float(data.get("shareLoanRate", 0.2))
    emergency_loan_rate = float(data.get("emergencyLoanRate", 0.1))
    password = data.get("password")
    
    if password != "admin123":
        return jsonify({"error": "Invalid password"}), 403
    if share_loan_rate < 0 or emergency_loan_rate < 0:
        return jsonify({"error": "Interest rates cannot be negative"}), 400
    
    try:
        cur.execute("""
            INSERT INTO interest_rates (month, share_loan_rate, emergency_loan_rate)
            VALUES (%s, %s, %s)
            ON CONFLICT (month) DO UPDATE SET
                share_loan_rate = EXCLUDED.share_loan_rate,
                emergency_loan_rate = EXCLUDED.emergency_loan_rate
        """, (month, share_loan_rate, emergency_loan_rate))
        conn.commit()
        return jsonify({"message": f"Interest rates updated for {month}"}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500

# Get interest rates for a specific month
@app.route("/api/interest-rates/<month>", methods=["GET"])
def get_interest_rates_endpoint(month):
    try:
        rates = get_interest_rates(month)
        return jsonify(rates)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Member management endpoints
@app.route("/api/member/update/<int:id>", methods=["PUT"])
def update_member(id):
    data = request.json
    name = data.get("name")
    shares = float(data.get("shares", 0))
    password = data.get("password")
    
    if password != "admin123":
        return jsonify({"error": "Invalid password"}), 403
    
    try:
        cur.execute("UPDATE members SET name = %s, shares = %s WHERE id = %s", (name, shares, id))
        conn.commit()
        return jsonify({"message": "Member updated"}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500

@app.route("/api/member/delete/<int:id>", methods=["DELETE"])
def delete_member(id):
    data = request.json
    password = data.get("password")
    
    if password != "admin123":
        return jsonify({"error": "Invalid password"}), 403
    
    try:
        cur.execute("DELETE FROM monthly_records WHERE member_id = %s", (id,))
        cur.execute("DELETE FROM loan_repayments WHERE member_id = %s", (id,))
        cur.execute("DELETE FROM members WHERE id = %s", (id,))
        conn.commit()
        return jsonify({"message": "Member deleted"}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500

@app.route("/api/member/add-shares/<int:member_id>", methods=["POST"])
def add_shares(member_id):
    data = request.json
    amount = float(data.get("amount", 0))
    month = data.get("month")
    password = data.get("password")
    
    if password != "admin123":
        return jsonify({"error": "Invalid password"}), 403
    if amount <= 0:
        return jsonify({"error": "Invalid amount"}), 400
    
    try:
        # Update shares in members table
        cur.execute("UPDATE members SET shares = shares + %s WHERE id = %s", (amount, member_id))
        
        # Update or insert monthly_records for the selected month and all subsequent months
        all_months = [
            "February 2025", "March 2025", "April 2025", "May 2025", "June 2025",
            "July 2025", "August 2025", "September 2025", "October 2025"
        ]
        month_index = all_months.index(month)
        
        for m in all_months[month_index:]:
            cur.execute("""
                SELECT shares FROM monthly_records WHERE member_id = %s AND month = %s
            """, (member_id, m))
            existing = cur.fetchone()
            if existing:
                cur.execute("""
                    UPDATE monthly_records SET shares = shares + %s
                    WHERE member_id = %s AND month = %s
                """, (amount, member_id, m))
            else:
                cur.execute("""
                    INSERT INTO monthly_records (member_id, month, shares, split_label)
                    VALUES (%s, %s, %s, %s)
                """, (member_id, m, amount, "Main"))
        
        conn.commit()
        return jsonify({"message": f"Added Ksh {amount} shares for member {member_id} in {month} and subsequent months"}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)