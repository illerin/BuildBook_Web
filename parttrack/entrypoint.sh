#!/bin/bash
set -e

PGDATA=/var/lib/postgresql/data
PG_USER=parttrack
PG_DB=parttrack
PG_PASS=parttrack
PG_LOG=/var/lib/postgresql/postgresql.log

# Create runtime dir postgres needs for its socket/lock file
mkdir -p /run/postgresql
chown postgres:postgres /run/postgresql

# Ensure postgres owns its data dir and log
mkdir -p "$PGDATA"
touch "$PG_LOG"
chown -R postgres:postgres "$PGDATA" "$PG_LOG"

# Init postgres data dir if needed
if [ ! -f "$PGDATA/PG_VERSION" ]; then
    echo ">>> Initializing PostgreSQL database..."
    su -s /bin/sh postgres -c "initdb -D $PGDATA --auth=trust"

    cat > "$PGDATA/pg_hba.conf" << 'HBA'
local   all             all                                     trust
host    all             all             127.0.0.1/32            md5
host    all             all             ::1/128                 md5
HBA
    chown postgres:postgres "$PGDATA/pg_hba.conf"
fi

# Start PostgreSQL
echo ">>> Starting PostgreSQL..."
su -s /bin/sh postgres -c "pg_ctl start -D $PGDATA -l $PG_LOG -w -t 30" || {
    echo "!!! pg_ctl failed. Log output:"
    cat "$PG_LOG" 2>/dev/null || echo "(log empty)"
    exit 1
}

# Create user and database if they don't exist
echo ">>> Setting up database..."
su -s /bin/sh postgres -c "psql -U postgres -tc \"SELECT 1 FROM pg_roles WHERE rolname='$PG_USER'\" | grep -q 1 || psql -U postgres -c \"CREATE USER $PG_USER WITH PASSWORD '$PG_PASS';\""
su -s /bin/sh postgres -c "psql -U postgres -tc \"SELECT 1 FROM pg_database WHERE datname='$PG_DB'\" | grep -q 1 || psql -U postgres -c \"CREATE DATABASE $PG_DB OWNER $PG_USER;\""

# Run schema migration
su -s /bin/sh postgres -c "psql -U $PG_USER -d $PG_DB -f /docker-entrypoint-initdb.d/schema.sql"

# Start Node backend
echo ">>> Starting Node.js backend..."
node /app/server.js &

sleep 1

# Start nginx
echo ">>> Starting nginx..."
nginx -g "daemon off;"
