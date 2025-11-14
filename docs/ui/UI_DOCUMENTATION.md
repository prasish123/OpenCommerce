# OpenCommerce UI Documentation

## Document Information
- **Version**: 1.0
- **Date**: November 14, 2025
- **Framework**: React 18 + TypeScript + TailwindCSS
- **Build Tool**: Vite

---

## Table of Contents
1. [Overview](#overview)
2. [Page Components](#page-components)
3. [Shared Components](#shared-components)
4. [State Management](#state-management)
5. [Styling Guide](#styling-guide)
6. [Component API Reference](#component-api-reference)
7. [User Workflows](#user-workflows)

---

## Overview

### Technology Stack
- **React**: 18.x
- **TypeScript**: 5.x
- **Vite**: Build tool for fast development
- **TailwindCSS**: Utility-first CSS framework
- **React Router**: v6 for routing
- **TanStack Query (React Query)**: Server state management
- **Zustand**: Client state management
- **Lucide React**: Icon library
- **Sonner**: Toast notifications
- **idb (IndexedDB)**: Offline storage

### Project Structure
```
ui/
├── src/
│   ├── main.tsx              # React entry point
│   ├── App.tsx               # Router configuration
│   ├── index.css             # Global styles + Tailwind
│   │
│   ├── pages/                # Page-level components
│   │   ├── Login.tsx
│   │   ├── POSTerminal.tsx
│   │   └── OrderQueue.tsx
│   │
│   ├── components/           # Reusable components
│   │   ├── Login.tsx
│   │   ├── ManagerOverride.tsx
│   │   ├── OrderQueue.tsx
│   │   ├── AdminDashboard.tsx
│   │   └── BackOffice/
│   │       ├── BackOfficePortal.tsx
│   │       ├── ProductManagement.tsx
│   │       ├── PromotionManagement.tsx
│   │       ├── StoreConfiguration.tsx
│   │       ├── UserManagement.tsx
│   │       └── SyncMonitor.tsx
│   │
│   ├── store/                # State management
│   │   └── authStore.ts      # Zustand auth store
│   │
│   └── lib/                  # Utilities
│       └── api-client.ts
│
├── public/                   # Static assets
└── package.json
```

---

## Page Components

### 1. Login Page (`/login`)

**File**: `ui/src/pages/Login.tsx` & `ui/src/components/Login.tsx`

**Purpose**: Authenticate users via 4-digit PIN

**UI Elements**:
```
┌─────────────────────────────────────────────┐
│                                             │
│          OpenCommerce POS                   │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │                                       │  │
│  │  Enter 4-digit PIN:                   │  │
│  │  ┌───┬───┬───┬───┐                   │  │
│  │  │ • │ • │ • │ • │                   │  │
│  │  └───┴───┴───┴───┘                   │  │
│  │                                       │  │
│  │  ┌─────────────────┐                 │  │
│  │  │     Login       │                 │  │
│  │  └─────────────────┘                 │  │
│  │                                       │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  Terminal: POS-001                          │
└─────────────────────────────────────────────┘
```

**Key Features**:
- PIN input (masked with dots)
- Auto-focus on input field
- Enter key submits form
- Error display for invalid PIN
- Account lockout message after 6 failures
- Loading state during authentication

**Props**: None (standalone page)

**State**:
```typescript
const [pin, setPin] = useState('');
const [error, setError] = useState('');
const [loading, setLoading] = useState(false);
```

**API Integration**:
```typescript
const handleLogin = async () => {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ pin, terminalId: 'POS-001' })
    });

    if (response.ok) {
      const { token, user } = await response.json();
      authStore.setAuth(token, user);
      navigate('/pos'); // Redirect based on role
    } else {
      setError('Invalid PIN');
    }
  } catch (err) {
    setError('Login failed');
  }
};
```

**Navigation After Login**:
- **Cashier/Manager** → `/pos` (POS Terminal)
- **Admin** → `/backoffice` (Back-Office Portal)

---

### 2. POS Terminal Page (`/pos`)

**File**: `ui/src/pages/POSTerminal.tsx`

**Purpose**: Main checkout interface for cashiers

**UI Layout**:
```
┌─────────────────────────────────────────────────────────────────────┐
│  Header:  [Logo] OpenCommerce      User: Sarah (Cashier)  [Logout] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐ │
│  │  BARCODE SCAN / SEARCH      │  │  SHOPPING CART              │ │
│  │                             │  │                             │ │
│  │  [____________🔍]            │  │  Corona Extra 6-Pack        │ │
│  │  Auto-focus input           │  │  Qty: 2  x $12.99  = $25.98 │ │
│  │                             │  │  [+] [-] [🗑️]              │ │
│  │  Last Scanned:              │  │                             │ │
│  │  012345678901               │  │  ─────────────────────────  │ │
│  │  Corona Extra 6-Pack        │  │  Subtotal:        $25.98    │ │
│  │  $12.99  ✅ In Stock        │  │  Tax (7%):         $1.82    │ │
│  │                             │  │  ─────────────────────────  │ │
│  │  ┌─────────────────────┐    │  │  TOTAL:           $27.80    │ │
│  │  │  Add to Cart        │    │  │                             │ │
│  │  └─────────────────────┘    │  │  🎉 Promo: Beer Sale (-$3)  │ │
│  │                             │  │                             │ │
│  └─────────────────────────────┘  │  ┌────────────┬───────────┐ │ │
│                                   │  │  💳 Card   │ 💵 Cash   │ │ │
│                                   │  └────────────┴───────────┘ │ │
│                                   │  ┌─────────────────────────┐ │ │
│                                   │  │   🗑️ Void Transaction   │ │ │
│                                   │  └─────────────────────────┘ │ │
│                                   └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

**Key Features**:

**1. Barcode Input**:
- Auto-focus on input field (always ready to scan)
- Real-time product lookup on Enter
- Display product details (name, price, stock status)
- Error toast if product not found

**2. Shopping Cart**:
- List of scanned items with quantities
- Increment/decrement quantity buttons
- Remove item button (trash icon)
- Running total with tax breakdown
- Applied promotions highlighted

**3. Payment Buttons**:
- **Card Payment**: Opens Stripe Terminal flow
- **Cash Payment**: Opens cash tender dialog

**4. Void Transaction**:
- Requires manager override
- Shows confirmation dialog

**Component Structure**:
```typescript
function POSTerminal() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [barcode, setBarcode] = useState('');
  const [currentProduct, setCurrentProduct] = useState<Product | null>(null);

  const handleBarcodeSubmit = async () => {
    const product = await fetchProduct(barcode);
    setCurrentProduct(product);
  };

  const addToCart = (product: Product) => {
    // Check if product already in cart
    const existing = cart.find(item => item.barcode === product.barcode);
    if (existing) {
      updateQuantity(existing.barcode, existing.quantity + 1);
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
    }
  };

  const updateQuantity = (barcode: string, newQty: number) => {
    setCart(cart.map(item =>
      item.barcode === barcode ? { ...item, quantity: newQty } : item
    ));
  };

  const removeItem = (barcode: string) => {
    setCart(cart.filter(item => item.barcode !== barcode));
  };

  const calculateTotal = () => {
    const subtotal = cart.reduce((sum, item) =>
      sum + (item.unitPrice * item.quantity), 0
    );
    const tax = subtotal * TAX_RATE;
    return { subtotal, tax, total: subtotal + tax };
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Left: Barcode input */}
      <div>
        <input
          ref={barcodeInputRef}
          value={barcode}
          onChange={e => setBarcode(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && handleBarcodeSubmit()}
          autoFocus
        />
        {currentProduct && <ProductCard product={currentProduct} />}
      </div>

      {/* Right: Cart */}
      <div>
        <CartList items={cart} onUpdate={updateQuantity} onRemove={removeItem} />
        <TotalDisplay {...calculateTotal()} />
        <PaymentButtons cart={cart} />
      </div>
    </div>
  );
}
```

**Payment Flow**:
```typescript
const handleCardPayment = async () => {
  const response = await fetch('/api/payment/card', {
    method: 'POST',
    body: JSON.stringify({
      cartId: cart.id,
      amount: total * 100, // Convert to cents
      terminalId: 'tmr_abc123'
    })
  });

  if (response.ok) {
    toast.success('Payment successful!');
    printReceipt();
    clearCart();
  } else {
    toast.error('Payment failed');
  }
};

const handleCashPayment = () => {
  setShowCashDialog(true);
};
```

---

### 3. Order Queue Page (`/queue`)

**File**: `ui/src/pages/OrderQueue.tsx` & `ui/src/components/OrderQueue.tsx`

**Purpose**: Unified view of all orders from all channels

**UI Layout**:
```
┌─────────────────────────────────────────────────────────────────────┐
│  Header:  Order Queue                     User: Mike (Manager)      │
├─────────────────────────────────────────────────────────────────────┤
│  Filters:  [All Channels ▼]  [All Statuses ▼]  [🔄 Refresh]        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  🚗 DoorDash  #DD-001  NEW                            10:30AM │  │
│  │  John Doe  •  +1-555-0123  •  ⚠️ Contains Alcohol            │  │
│  │  2x Corona Extra 6-Pack                                      │  │
│  │  Total: $46.13  •  Pickup: 11:00 AM                          │  │
│  │  [Accept] [Reject] [View Details]                            │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  🌐 Website  #WEB-042  PREPARING                      10:15AM │  │
│  │  Jane Smith  •  jane@email.com  •  Pickup                    │  │
│  │  1x Wine Bottle, 1x Cheese Plate                             │  │
│  │  Total: $35.50  •  Pickup: 10:45 AM                          │  │
│  │  [Mark Ready] [View Details]                                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  🏪 In-Store  #TXN-12345  COMPLETED                   09:50AM │  │
│  │  Walk-in Customer                                             │  │
│  │  3x Beer 6-Pack, 1x Snacks                                   │  │
│  │  Total: $42.75  •  Paid: Card (...4242)                      │  │
│  │  [View Receipt]                                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Key Features**:

**1. Real-Time Updates**:
- WebSocket connection for live order updates
- New order notification (sound + visual badge)
- Auto-scroll to new orders

**2. Channel Icons**:
- 🚗 DoorDash
- 🚕 Uber Eats
- 🌐 Website
- 🏪 In-Store

**3. Status Badges**:
```typescript
const statusColors = {
  NEW: 'bg-blue-500',
  ACCEPTED: 'bg-yellow-500',
  PREPARING: 'bg-orange-500',
  READY: 'bg-green-500',
  PICKED_UP: 'bg-purple-500',
  COMPLETED: 'bg-gray-500',
  CANCELLED: 'bg-red-500'
};
```

**4. Order Actions**:
- **NEW** → [Accept] [Reject]
- **ACCEPTED** → [Start Preparing]
- **PREPARING** → [Mark Ready]
- **READY** → [Mark Picked Up]
- All statuses → [View Details]

**5. Age Verification Alert**:
- Red warning badge if order contains alcohol
- Blocks status change to PICKED_UP without verification

**Component Structure**:
```typescript
function OrderQueue() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | 'ALL'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<Status | 'ALL'>('ALL');

  useEffect(() => {
    // Fetch initial orders
    fetchOrders();

    // Subscribe to WebSocket for real-time updates
    const ws = new WebSocket('ws://localhost:3000/orders');
    ws.onmessage = (event) => {
      const newOrder = JSON.parse(event.data);
      setOrders(prev => [newOrder, ...prev]);
      toast.info(`New ${newOrder.channel} order!`, {
        action: { label: 'View', onClick: () => viewOrder(newOrder.id) }
      });
    };

    return () => ws.close();
  }, []);

  const filteredOrders = orders.filter(order => {
    if (selectedChannel !== 'ALL' && order.channel !== selectedChannel) return false;
    if (selectedStatus !== 'ALL' && order.status !== selectedStatus) return false;
    return true;
  });

  const updateOrderStatus = async (orderId: string, newStatus: Status) => {
    await fetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus })
    });

    setOrders(orders.map(order =>
      order.id === orderId ? { ...order, status: newStatus } : order
    ));
  };

  return (
    <div>
      <FilterBar
        onChannelChange={setSelectedChannel}
        onStatusChange={setSelectedStatus}
      />

      <div className="space-y-4">
        {filteredOrders.map(order => (
          <OrderCard
            key={order.id}
            order={order}
            onUpdateStatus={updateOrderStatus}
          />
        ))}
      </div>
    </div>
  );
}
```

**Order Detail Modal**:
```typescript
function OrderDetailModal({ order, onClose }) {
  return (
    <Dialog open onClose={onClose}>
      <DialogTitle>
        {order.channel} Order #{order.orderNumber}
      </DialogTitle>

      <DialogContent>
        <Section title="Customer">
          <p>{order.customerName}</p>
          <p>{order.customerPhone}</p>
          {order.deliveryAddress && <Address {...order.deliveryAddress} />}
        </Section>

        <Section title="Items">
          {order.items.map(item => (
            <OrderItem
              key={item.id}
              name={item.name}
              quantity={item.quantity}
              price={item.unitPrice}
              ageRestricted={item.ageVerificationRequired}
            />
          ))}
        </Section>

        <Section title="Totals">
          <TotalBreakdown
            subtotal={order.subtotal}
            tax={order.tax}
            deliveryFee={order.deliveryFee}
            tip={order.tip}
            total={order.total}
          />
        </Section>

        {order.hasAlcohol && !order.ageVerified && (
          <AgeVerificationForm orderId={order.id} />
        )}

        <StatusTimeline history={order.statusHistory} />
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button onClick={() => updateStatus(order.id, nextStatus)}>
          Update to {nextStatus}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

---

### 4. Back-Office Portal (`/backoffice`)

**File**: `ui/src/components/BackOffice/BackOfficePortal.tsx`

**Purpose**: Admin dashboard for store management

**UI Layout**:
```
┌─────────────────────────────────────────────────────────────────────┐
│  Header:  Back Office                    User: Admin      [Logout]  │
├─────────────────────────────────────────────────────────────────────┤
│  [Products] [Promotions] [Store Config] [Users] [Sync] [Reports]   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Active Tab Content Renders Here                                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Tabs**:

#### Tab 1: Product Management

**File**: `ui/src/components/BackOffice/ProductManagement.tsx`

```
┌─────────────────────────────────────────────────────────────────────┐
│  Product Management                               [+ Add Product]   │
├─────────────────────────────────────────────────────────────────────┤
│  Search: [____________🔍]  Category: [All ▼]  In Stock: [✓]        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ Barcode  │ Name              │ Base Price │ In Stock │ Edit │   │
│  ├────────────────────────────────────────────────────────────┤    │
│  │ 01234... │ Corona 6-Pack     │ $12.99     │ ✅       │ ✏️   │   │
│  │ 01235... │ Wine Bottle       │ $19.99     │ ✅       │ ✏️   │   │
│  │ 01236... │ Spirits 750ml     │ $29.99     │ ❌       │ ✏️   │   │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  Showing 1-10 of 150  [< Previous] [Next >]                        │
└─────────────────────────────────────────────────────────────────────┘
```

**Features**:
- Add/Edit/Delete products
- Set channel-specific pricing
- Bulk import (CSV/NAXML)
- Search and filter
- Enable/disable products

---

#### Tab 2: Promotion Management

**File**: `ui/src/components/BackOffice/PromotionManagement.tsx`

```
┌─────────────────────────────────────────────────────────────────────┐
│  Promotion Management                         [+ Create Promotion]  │
├─────────────────────────────────────────────────────────────────────┤
│  Active: [✓]  Upcoming: [ ]  Expired: [ ]                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ Beer Sale - Mix & Match                              ACTIVE │    │
│  │ Buy 3 or more for $30                                       │    │
│  │ Valid: Nov 1 - Nov 30  •  Mon-Sun                          │    │
│  │ [Edit] [Disable] [Delete]                                  │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ BOGO Wine                                            UPCOMING │   │
│  │ Buy one get one 50% off                                     │    │
│  │ Valid: Dec 1 - Dec 25  •  Fri-Sun only                     │    │
│  │ [Edit] [Enable Early] [Delete]                             │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

**Create Promotion Form**:
```typescript
function CreatePromotionForm() {
  const [type, setType] = useState<PromotionType>('MIX_AND_MATCH');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);

  return (
    <form>
      <Select label="Promotion Type" value={type} onChange={setType}>
        <option value="MIX_AND_MATCH">Mix & Match</option>
        <option value="BOGO">Buy One Get One</option>
        <option value="COMBO">Combo Deal</option>
        <option value="PERCENT_OFF">Percent Off</option>
        <option value="DOLLAR_OFF">Dollar Off</option>
      </Select>

      <Input label="Name" value={name} onChange={setName} />
      <Textarea label="Description" value={description} onChange={setDescription} />

      <DatePicker label="Start Date" value={startDate} onChange={setStartDate} />
      <DatePicker label="End Date" value={endDate} onChange={setEndDate} />

      <CheckboxGroup label="Days of Week">
        <Checkbox label="Monday" value={1} checked={daysOfWeek.includes(1)} />
        <Checkbox label="Tuesday" value={2} checked={daysOfWeek.includes(2)} />
        {/* ... */}
      </CheckboxGroup>

      {type === 'MIX_AND_MATCH' && (
        <>
          <Input label="Required Quantity" type="number" />
          <Input label="Discounted Price" type="number" step="0.01" />
        </>
      )}

      <Button type="submit">Create Promotion</Button>
    </form>
  );
}
```

---

#### Tab 3: Store Configuration

**File**: `ui/src/components/BackOffice/StoreConfiguration.tsx`

```
┌─────────────────────────────────────────────────────────────────────┐
│  Store Configuration                                  [💾 Save]     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  General Settings:                                                  │
│  Store Name:  [Liquor River Ocala_____]                            │
│  Address:     [123 Main St____________]                            │
│  Phone:       [(352) 555-0123________]                             │
│  Tax Rate:    [7______] %                                          │
│  Timezone:    [America/New_York  ▼]                                │
│                                                                     │
│  Channel Markup:                                                    │
│  DoorDash:    [30______] %                                         │
│  Uber Eats:   [25______] %                                         │
│  Website:     [10______] %                                         │
│                                                                     │
│  Feature Flags:                                                     │
│  [✓] Enable DoorDash Integration                                   │
│  [✓] Enable Uber Eats Integration                                  │
│  [ ] Enable Website Integration                                    │
│  [✓] Enable Ollama Semantic Search                                 │
│  [✓] Require Age Verification for Alcohol                          │
│                                                                     │
│  Hardware Configuration:                                            │
│  Printer Vendor ID:  [0x04b8____________]                          │
│  Printer Product ID: [0x0e15____________]                          │
│  Scanner Vendor ID:  [0x05e0____________]                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

#### Tab 4: User Management

**File**: `ui/src/components/BackOffice/UserManagement.tsx`

```
┌─────────────────────────────────────────────────────────────────────┐
│  User Management                                  [+ Add User]      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ Username  │ Role     │ Active │ Last Login    │ Actions   │   │
│  ├────────────────────────────────────────────────────────────┤    │
│  │ cashier1  │ Cashier  │ ✅     │ 10 min ago    │ Edit │Disable│  │
│  │ manager1  │ Manager  │ ✅     │ 2 hours ago   │ Edit │Disable│  │
│  │ admin1    │ Admin    │ ✅     │ 1 day ago     │ Edit │Disable│  │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Add User Form**:
```typescript
function AddUserForm() {
  return (
    <form>
      <Input label="Username" required />
      <Select label="Role" required>
        <option value="CASHIER">Cashier</option>
        <option value="MANAGER">Manager</option>
        <option value="ADMIN">Admin</option>
      </Select>
      <Input label="4-Digit PIN" type="password" maxLength={4} required />
      <Input label="Confirm PIN" type="password" maxLength={4} required />
      <Select label="Assign to Store">
        <option value="STORE_001">Liquor River Ocala</option>
      </Select>
      <Button type="submit">Create User</Button>
    </form>
  );
}
```

---

#### Tab 5: Sync Monitor

**File**: `ui/src/components/BackOffice/SyncMonitor.tsx`

```
┌─────────────────────────────────────────────────────────────────────┐
│  Sync Monitor                                                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Elistar Back-Office Sync:                                          │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  Last Sync: Nov 14, 2025 10:00 AM                    ✅    │    │
│  │  Products synced: 150  •  Promotions: 12  •  Errors: 0    │    │
│  │  [🔄 Sync Now] [View Sync Log]                            │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  Channel Menu Sync:                                                 │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  🚗 DoorDash                                          ✅    │    │
│  │  Last sync: 2 hours ago  •  150 items                     │    │
│  │  [Sync Menu to DoorDash]                                  │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  🚕 Uber Eats                                         ✅    │    │
│  │  Last sync: 3 hours ago  •  150 items                     │    │
│  │  [Sync Menu to Uber Eats]                                 │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  Sync History:                                                      │
│  [View Full Sync Log] [Export to CSV]                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Shared Components

### ManagerOverride Component

**File**: `ui/src/components/ManagerOverride.tsx`

**Purpose**: Prompt for manager PIN when performing restricted actions

```typescript
interface ManagerOverrideProps {
  action: string;
  onApprove: (managerId: string) => void;
  onCancel: () => void;
}

function ManagerOverride({ action, onApprove, onCancel }: ManagerOverrideProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    const response = await fetch('/api/auth/verify-manager', {
      method: 'POST',
      body: JSON.stringify({ pin, action })
    });

    if (response.ok) {
      const { managerId } = await response.json();
      onApprove(managerId);
    } else {
      setError('Invalid manager PIN or insufficient permissions');
    }
  };

  return (
    <Dialog open onClose={onCancel}>
      <DialogTitle>Manager Authorization Required</DialogTitle>
      <DialogContent>
        <p>Action: {action}</p>
        <Input
          label="Manager PIN"
          type="password"
          value={pin}
          onChange={setPin}
          autoFocus
        />
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSubmit} variant="primary">Authorize</Button>
      </DialogActions>
    </Dialog>
  );
}
```

---

## State Management

### Auth Store (Zustand)

**File**: `ui/src/store/authStore.ts`

```typescript
import create from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  username: string;
  role: 'CASHIER' | 'MANAGER' | 'ADMIN' | 'SUPER_ADMIN';
  storeId: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
  hasPermission: (permission: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,

      setAuth: (token, user) => set({ token, user }),

      logout: () => set({ token: null, user: null }),

      isAuthenticated: () => !!get().token,

      hasPermission: (permission) => {
        const { user } = get();
        if (!user) return false;

        // Define role permissions
        const permissions = {
          CASHIER: ['read_products', 'read_orders', 'write_orders'],
          MANAGER: ['price_override', 'void_transaction', 'refund', 'read_reports'],
          ADMIN: ['manage_users', 'write_products', 'system_config'],
          SUPER_ADMIN: ['*']
        };

        const rolePerms = permissions[user.role] || [];
        return rolePerms.includes('*') || rolePerms.includes(permission);
      }
    }),
    { name: 'auth-storage' }
  )
);
```

---

## Styling Guide

### TailwindCSS Configuration

**File**: `ui/tailwind.config.js`

```javascript
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6', // Blue
        secondary: '#8b5cf6', // Purple
        success: '#10b981', // Green
        warning: '#f59e0b', // Orange
        error: '#ef4444', // Red
        doordash: '#ff3008',
        ubereats: '#06c167',
        website: '#6366f1',
        instore: '#64748b'
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif']
      }
    }
  },
  plugins: []
};
```

### Common Patterns

**Buttons**:
```typescript
// Primary Button
<button className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90">
  Save
</button>

// Danger Button
<button className="bg-error text-white px-4 py-2 rounded-lg hover:bg-error/90">
  Delete
</button>

// Ghost Button
<button className="text-primary hover:bg-primary/10 px-4 py-2 rounded-lg">
  Cancel
</button>
```

**Cards**:
```typescript
<div className="bg-white rounded-lg shadow p-6 border border-gray-200">
  <h3 className="text-lg font-semibold mb-4">Card Title</h3>
  <p className="text-gray-600">Card content</p>
</div>
```

**Form Inputs**:
```typescript
<div className="mb-4">
  <label className="block text-sm font-medium text-gray-700 mb-1">
    Label
  </label>
  <input
    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
    type="text"
  />
</div>
```

---

## Component API Reference

### OrderCard Component

```typescript
interface OrderCardProps {
  order: Order;
  onUpdateStatus: (orderId: string, status: Status) => void;
  onViewDetails: (orderId: string) => void;
}

function OrderCard({ order, onUpdateStatus, onViewDetails }: OrderCardProps) {
  // ...
}
```

### CartList Component

```typescript
interface CartListProps {
  items: CartItem[];
  onUpdateQuantity: (barcode: string, quantity: number) => void;
  onRemoveItem: (barcode: string) => void;
}
```

---

## User Workflows

### Complete POS Transaction

1. Cashier scans barcode (or enters manually)
2. Product details displayed
3. Click "Add to Cart"
4. Repeat for all items
5. Review cart (check promotions applied)
6. Select payment method (Card/Cash)
7. If card: Customer taps card on reader
8. If cash: Enter tendered amount, system calculates change
9. Receipt prints automatically
10. Cart clears, ready for next customer

### Process DoorDash Order

1. Order appears in queue with notification sound
2. Staff clicks order to view details
3. Check items, note alcohol warning
4. Click "Accept"
5. Gather items from inventory
6. Click "Start Preparing"
7. Package order
8. Click "Ready"
9. Dasher arrives
10. Verify Dasher identity
11. If alcohol: Complete age verification (scan ID/take photo)
12. Click "Picked Up"
13. Order marked COMPLETED automatically after delivery

---

**Document Version**: 1.0
**Last Updated**: November 14, 2025
**Framework**: React 18 + TypeScript
**Design System**: TailwindCSS
