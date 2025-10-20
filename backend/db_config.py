import psycopg2

def get_db_connection():
    conn = psycopg2.connect(
        dbname="investandgrow",
        user="postgres",
        password="1391",
        host="localhost",
        port="5432"
    )
    return conn
