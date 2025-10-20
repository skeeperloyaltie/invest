# ---------- Base Image ----------
FROM python:3.10-slim

# ---------- Working Directory ----------
WORKDIR /app

# ---------- System Dependencies ----------
RUN apt-get update && apt-get install -y \
    libpq-dev gcc && \
    rm -rf /var/lib/apt/lists/*

# ---------- Copy Files ----------
COPY backend/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy everything from backend folder
COPY backend/ .

# ---------- Expose Port ----------
EXPOSE 8000

# ---------- Start Flask via Gunicorn ----------
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "app:app"]
