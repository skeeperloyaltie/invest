drop table if exists members;
drop table if exists transactions
CREATE TABLE if not exists members (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  shares NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE if not exists monthly_records (
  id SERIAL PRIMARY KEY,
  member_id INTEGER REFERENCES members(id),
  month VARCHAR(50) NOT NULL,
  emergency NUMERIC(12,2) DEFAULT 0,
  loan NUMERIC(12,2) DEFAULT 0,
  loan_type VARCHAR(50),
  repayment NUMERIC(12,2) DEFAULT 0,
  interest NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

