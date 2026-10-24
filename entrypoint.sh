#!/bin/bash
set -e

export SQLCMDPASSWORD="${MSSQL_SA_PASSWORD}"

/opt/mssql/bin/sqlservr &
SQL_PID=$!

trap 'kill -TERM "$SQL_PID" 2>/dev/null || true; wait "$SQL_PID"' TERM INT

until /opt/mssql-tools18/bin/sqlcmd \
    -S localhost \
    -U sa \
    -C \
    -b \
    -Q "SELECT 1" >/dev/null 2>&1
do
    if ! kill -0 "$SQL_PID" 2>/dev/null; then
        wait "$SQL_PID"
        exit 1
    fi
    sleep 2
done

echo "SQL Server is ready. Initializing database..."

/opt/mssql-tools18/bin/sqlcmd \
    -S localhost \
    -U sa \
    -C \
    -b \
    -i /docker-init/init.sql

echo "Database initialization completed."

wait "$SQL_PID"
