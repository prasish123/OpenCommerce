#!/bin/bash

# Setup Test Database for OpenCommerce POS
# This script starts PostgreSQL, creates schemas, and seeds test data

set -e

echo "🚀 Setting up OpenCommerce POS Test Database..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"

# Stop any existing containers
echo "🛑 Stopping existing containers..."
docker-compose -f docker-compose.test.yml down -v || true

# Start PostgreSQL and Redis
echo "🐘 Starting PostgreSQL and Redis..."
docker-compose -f docker-compose.test.yml up -d

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
max_attempts=30
attempt=0

while [ $attempt -lt $max_attempts ]; do
    if docker exec opencommerce-postgres-test pg_isready -U test > /dev/null 2>&1; then
        echo "✅ PostgreSQL is ready!"
        break
    fi
    attempt=$((attempt + 1))
    echo "Waiting... ($attempt/$max_attempts)"
    sleep 2
done

if [ $attempt -eq $max_attempts ]; then
    echo "❌ PostgreSQL failed to start after $max_attempts attempts"
    docker-compose -f docker-compose.test.yml logs postgres-test
    exit 1
fi

# Wait a bit more for migrations to run
sleep 3

# Seed test data
echo "🌱 Seeding test data..."
docker exec -i opencommerce-postgres-test psql -U test -d opencommerce_test < migrations/02-seed-test-data.sql

# Verify setup
echo "🔍 Verifying database setup..."
docker exec opencommerce-postgres-test psql -U test -d opencommerce_test -c "\dt auth_service.*"
docker exec opencommerce-postgres-test psql -U test -d opencommerce_test -c "SELECT COUNT(*) as user_count FROM auth_service.users;"
docker exec opencommerce-postgres-test psql -U test -d opencommerce_test -c "SELECT COUNT(*) as product_count FROM product_service.products;"

echo ""
echo "✅ Test database setup complete!"
echo ""
echo "📊 Database Details:"
echo "   Host: localhost"
echo "   Port: 5432"
echo "   Database: opencommerce_test"
echo "   User: test"
echo "   Password: test"
echo ""
echo "🧪 Run tests with:"
echo "   npm test"
echo ""
echo "🛑 Stop database with:"
echo "   docker-compose -f docker-compose.test.yml down"
echo ""
