# 🚀 Quick Start Guide - Running OpenCommerce

This guide will get the entire OpenCommerce system up and running in minutes!

---

## Prerequisites

- **Docker** and **Docker Compose** installed
- **Node.js 20+** (for local development without Docker)
- At least **4GB RAM** available
- **10 Mbps internet** (to download Docker images)

---

## 🎯 Quick Start (Docker - Recommended)

### Step 1: Clone and Navigate
```bash
cd /home/user/OpenCommerce
```

### Step 2: Create Environment File
```bash
cp .env.example .env
```

**Note**: The default `.env` values work for local development. You don't need Stripe/DoorDash/Uber API keys to test the basic POS functionality.

### Step 3: Start All Services
```bash
docker-compose up -d
```

This will start:
- ✅ PostgreSQL 16 (with pgvector)
- ✅ Redis 7
- ✅ Ollama (AI for semantic search)
- ✅ OpenCommerce App (Backend API + Frontend UI)

**First-time startup takes 3-5 minutes** to download images and build the app.

### Step 4: Check Services are Running
```bash
docker-compose ps
```

You should see all services with status "Up":
```
NAME                      STATUS
opencommerce-app          Up
opencommerce-postgres     Up (healthy)
opencommerce-redis        Up (healthy)
opencommerce-ollama       Up (healthy)
```

### Step 5: View Logs (Optional)
```bash
docker-compose logs -f app
```

Press `Ctrl+C` to stop following logs.

### Step 6: Run Database Migrations
```bash
docker-compose exec app npm run migrate
```

This creates all database tables.

### Step 7: Load Sample Data
```bash
docker-compose exec app node scripts/seed-data.js
```

This will create:
- 3 test users (cashier, manager, admin)
- 20 sample products
- 5 promotions
- Sample inventory

### Step 8: Pull Ollama Model (Optional - for AI search)
```bash
docker-compose exec ollama ollama pull deepseek-r1:1.5b
```

This downloads the AI model for semantic product search (~900MB).

---

## 🌐 Access the Application

Once everything is running, you can access:

### 🖥️ POS Terminal (Frontend)
**URL**: http://localhost:8080

**Test Credentials**:
```
Cashier:
  PIN: 1234
  Role: Can process sales, view orders

Manager:
  PIN: 5678
  Role: Can override prices, void transactions, view reports

Admin:
  PIN: 9999
  Role: Full system access, user management
```

### 🔌 Backend API
**URL**: http://localhost:3000

**Health Check**: http://localhost:3000/health

**API Documentation**: See `docs/api/API_DOCUMENTATION.md`

### 💾 Database (PostgreSQL)
**Host**: localhost:5432
**Database**: opencommerce
**Username**: opencommerce
**Password**: opencommerce_dev_password

**Connect via psql**:
```bash
docker-compose exec postgres psql -U opencommerce
```

### 🔴 Redis
**Host**: localhost:6379

**Connect via redis-cli**:
```bash
docker-compose exec redis redis-cli
```

### 🤖 Ollama (AI)
**URL**: http://localhost:11434

**Test**:
```bash
curl http://localhost:11434/api/tags
```

---

## 🎮 How to Play with the System

### 1. Login to POS Terminal

1. Open http://localhost:8080 in your browser
2. Enter PIN: `1234` (Cashier)
3. You'll be redirected to the POS Terminal

### 2. Scan Products

**Option A: Use Barcode**
- Focus is auto-set on barcode input
- Type: `012345678901` (Corona 6-Pack sample)
- Press Enter
- Product appears with price
- Click "Add to Cart"

**Option B: Search by Name**
- Type: "corona" in search box
- Select from results
- Add to cart

### 3. Build a Cart

Add multiple items:
- `012345678901` - Corona Extra 6-Pack ($12.99)
- `012345678902` - Wine Bottle ($19.99)
- `012345678903` - Spirits 750ml ($29.99)

Watch the total update automatically with tax!

### 4. Process Payment

**Card Payment** (Simulated):
- Click "Card Payment"
- Payment will simulate Stripe Terminal
- Receipt preview shown

**Cash Payment**:
- Click "Cash Payment"
- Enter amount tendered: `$100.00`
- System calculates change: `$37.02`
- Shows change breakdown (bills and coins)

### 5. View Order Queue

Navigate to: http://localhost:8080/queue

See all orders from:
- 🏪 In-Store (your POS transactions)
- 🚗 DoorDash (simulated)
- 🚕 Uber Eats (simulated)
- 🌐 Website (simulated)

### 6. Back-Office Portal

Login with Admin PIN: `9999`

Navigate to: http://localhost:8080/backoffice

Explore tabs:
- **Products**: Add/edit/delete products
- **Promotions**: Create deals (BOGO, Mix & Match)
- **Store Config**: Change tax rate, markup percentages
- **Users**: Manage employees
- **Sync**: Elistar integration status

---

## 🧪 Test Scenarios

### Scenario 1: Basic POS Sale
1. Login as Cashier (PIN: 1234)
2. Scan: `012345678901` (Corona 6-Pack)
3. Quantity: 3
4. Promotion auto-applies: "3 for $36" (saves $2.97)
5. Pay with cash: $50
6. Get change: $14 + tax
7. Receipt prints (simulated)

### Scenario 2: Age Verification
1. Go to Order Queue
2. Find order with alcohol (⚠️ icon)
3. Click "View Details"
4. Click "Verify Age"
5. Enter customer age: 25
6. Verification logged
7. Can now mark "Picked Up"

### Scenario 3: Manager Override
1. Login as Cashier
2. Add item to cart
3. Click "Override Price"
4. System prompts for Manager PIN
5. Enter: 5678
6. Enter new price: $9.99
7. Override logged in audit trail

### Scenario 4: Inventory Check
1. Go to Back-Office → Products
2. Click any product
3. View "Available Quantity"
4. Make a sale with that product
5. Refresh - quantity decreases
6. Create online order - quantity moves to "Reserved"

---

## 📊 Sample Data Created

### Users
| Username | PIN | Role | Permissions |
|----------|-----|------|-------------|
| cashier1 | 1234 | CASHIER | Basic POS operations |
| manager1 | 5678 | MANAGER | + Price override, void, reports |
| admin1 | 9999 | ADMIN | + User management, system config |

### Products (20 items)
- Beer: Corona Extra 6-Pack, Budweiser 12-Pack, Heineken 6-Pack
- Wine: Red Wine Bottle, White Wine Bottle, Champagne
- Spirits: Vodka 750ml, Whiskey 750ml, Tequila 750ml
- Snacks: Chips, Pretzels, Mixed Nuts
- Beverages: Soda 2L, Energy Drink, Water 24-Pack
- Misc: Ice Bag, Cigarettes, Lighter, Candy Bar, Gum

### Promotions (5 deals)
1. **Beer Sale**: Buy 3 or more 6-packs for $36 (Mix & Match)
2. **Wine Wednesday**: 20% off all wine (Wed only)
3. **BOGO Snacks**: Buy one snack, get one 50% off
4. **Spirits Bundle**: Vodka + Mixer for $35
5. **Happy Hour**: $5 off orders > $50 (Fri-Sun, 5-7pm)

### Inventory
- All products start with 50 units in stock
- Available for immediate sale

---

## 🛑 Stopping the System

### Stop All Services
```bash
docker-compose down
```

### Stop and Remove All Data
```bash
docker-compose down -v
```

**Warning**: This deletes the database, cache, and all data!

---

## 🔧 Development Mode (Without Docker)

If you prefer to run outside Docker:

### 1. Start Infrastructure Only
```bash
docker-compose up -d postgres redis ollama
```

### 2. Install Dependencies
```bash
npm install
cd ui && npm install && cd ..
```

### 3. Run Migrations
```bash
npm run migrate
```

### 4. Seed Data
```bash
node scripts/seed-data.js
```

### 5. Start Backend (Terminal 1)
```bash
npm run dev
```

Runs on http://localhost:3000

### 6. Start Frontend (Terminal 2)
```bash
cd ui
npm run dev
```

Runs on http://localhost:5173 (Vite dev server)

---

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Check what's using the port
lsof -i :3000
lsof -i :8080
lsof -i :5432

# Kill the process or change ports in docker-compose.yml
```

### Database Connection Failed
```bash
# Check PostgreSQL is running
docker-compose ps postgres

# View logs
docker-compose logs postgres

# Restart PostgreSQL
docker-compose restart postgres
```

### App Container Crashes
```bash
# View app logs
docker-compose logs app

# Common issues:
# - Missing .env file (copy from .env.example)
# - Database not ready (wait 30s and restart)
# - Port conflict (change in docker-compose.yml)
```

### Migrations Not Running
```bash
# Manually run migrations
docker-compose exec app npm run migrate

# Check migration files exist
ls -la migrations/

# View migration status in database
docker-compose exec postgres psql -U opencommerce -c "SELECT * FROM pgmigrations;"
```

### Can't Login
```bash
# Re-seed the database
docker-compose exec app node scripts/seed-data.js

# Check users exist
docker-compose exec postgres psql -U opencommerce -c "SELECT username, role FROM auth_service.users;"
```

### Ollama Model Not Working
```bash
# Pull the model
docker-compose exec ollama ollama pull deepseek-r1:1.5b

# List installed models
docker-compose exec ollama ollama list

# Semantic search is optional - system works without it
```

---

## 📱 Mobile/Tablet Access

If you want to access from another device on your network:

1. Find your machine's IP:
```bash
ip addr show | grep inet
# or on macOS: ifconfig | grep inet
```

2. Access from other device:
- POS: http://YOUR_IP:8080
- API: http://YOUR_IP:3000

3. Update CORS in backend if needed (already configured for development).

---

## 🎉 You're Ready!

The system is now fully operational. You can:
- ✅ Process in-store sales
- ✅ View unified order queue
- ✅ Manage products and promotions
- ✅ Test age verification
- ✅ Try manager overrides
- ✅ Explore reporting

**Next Steps**:
- Review [API Documentation](docs/api/API_DOCUMENTATION.md) for integration
- Check [Sequence Diagrams](docs/flows/SEQUENCE_DIAGRAMS.md) to understand flows
- Read [Gaps Analysis](docs/GAPS_ANALYSIS.md) to see what's not implemented yet

---

## 💡 Tips

1. **Use Browser DevTools**: Open Network tab to see API calls
2. **Watch Logs**: `docker-compose logs -f app` to see real-time activity
3. **Database GUI**: Use pgAdmin or DBeaver to explore database
4. **API Testing**: Use Postman/Insomnia or curl for API testing
5. **Multiple Users**: Open multiple browser tabs for cashier + manager

---

## 🆘 Need Help?

- Check logs: `docker-compose logs [service-name]`
- Restart services: `docker-compose restart`
- Full reset: `docker-compose down -v && docker-compose up -d`
- Review docs: `docs/README.md`

**Enjoy exploring OpenCommerce!** 🎊
