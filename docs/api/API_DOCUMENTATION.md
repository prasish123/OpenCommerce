# OpenCommerce API Documentation

## Table of Contents
1. [Overview](#overview)
2. [Authentication](#authentication)
3. [API Endpoints](#api-endpoints)
4. [Error Handling](#error-handling)
5. [Rate Limiting](#rate-limiting)
6. [Webhooks](#webhooks)

---

## Overview

**Base URL**: `http://localhost:3000`
**API Version**: `v1`
**Protocol**: REST
**Content-Type**: `application/json`
**Authentication**: JWT Bearer Token + PIN-based

---

## Authentication

### Login Endpoint
```http
POST /api/auth/login
Content-Type: application/json

{
  "pin": "1234",
  "terminalId": "POS-001"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-123",
    "username": "cashier1",
    "role": "CASHIER",
    "storeId": "STORE_001"
  }
}
```

### Using JWT Token
Include the token in the Authorization header:
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Session Management
- **Session Timeout**: 15 minutes of inactivity
- **Auto-logout**: After timeout, user must re-authenticate
- **Failed Attempts**: Account locked after 6 failed login attempts
- **Lock Duration**: 30 minutes

---

## API Endpoints

### Health Check

#### GET /health
Check system health status

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-14T12:00:00Z",
  "services": {
    "database": "connected",
    "redis": "connected",
    "ollama": "available"
  }
}
```

---

### Product Management

#### GET /api/products/:barcode
Get product details by barcode with channel-specific pricing

**Parameters:**
- `barcode` (path) - Product barcode/UPC

**Query Parameters:**
- `channel` (optional) - Channel type: `IN_STORE`, `DOORDASH`, `UBER_EATS`, `WEBSITE`

**Example:**
```http
GET /api/products/012345678901?channel=DOORDASH
```

**Response:**
```json
{
  "id": "prod-123",
  "barcode": "012345678901",
  "name": "Corona Extra 6-Pack",
  "description": "Premium Mexican beer",
  "basePrice": 12.99,
  "channelPrice": {
    "IN_STORE": 12.99,
    "DOORDASH": 16.89,
    "UBER_EATS": 16.24,
    "WEBSITE": 14.29
  },
  "currentPrice": 16.89,
  "taxable": true,
  "taxRate": 0.07,
  "ageVerificationRequired": true,
  "minimumAge": 21,
  "merchandiseCode": "BEER",
  "availableQuantity": 48,
  "inStock": true,
  "promotions": [
    {
      "id": "promo-1",
      "name": "Beer Sale - 3 for $36",
      "type": "MIX_AND_MATCH",
      "description": "Buy 3 or more, get discount"
    }
  ]
}
```

#### GET /api/products/search
Search products by name, description, or barcode

**Query Parameters:**
- `q` (required) - Search query
- `channel` (optional) - Channel type for pricing
- `limit` (optional) - Max results (default: 20)
- `offset` (optional) - Pagination offset

**Example:**
```http
GET /api/products/search?q=corona&channel=IN_STORE&limit=10
```

**Response:**
```json
{
  "results": [
    {
      "id": "prod-123",
      "barcode": "012345678901",
      "name": "Corona Extra 6-Pack",
      "price": 12.99,
      "inStock": true,
      "relevanceScore": 0.95
    }
  ],
  "total": 5,
  "limit": 10,
  "offset": 0
}
```

---

### Order Management

#### GET /api/orders/today
Get unified order queue for today (all channels)

**Query Parameters:**
- `status` (optional) - Filter by status: `NEW`, `ACCEPTED`, `PREPARING`, `READY`, `PICKED_UP`, `COMPLETED`, `CANCELLED`
- `channel` (optional) - Filter by channel: `IN_STORE`, `DOORDASH`, `UBER_EATS`, `WEBSITE`

**Example:**
```http
GET /api/orders/today?status=NEW&channel=DOORDASH
```

**Response:**
```json
{
  "orders": [
    {
      "id": "ord-12345",
      "orderNumber": "DD-2024-001",
      "channel": "DOORDASH",
      "status": "NEW",
      "customerName": "John Doe",
      "customerPhone": "+1-555-0123",
      "deliveryAddress": "123 Main St, Ocala, FL 34470",
      "items": [
        {
          "productId": "prod-123",
          "name": "Corona Extra 6-Pack",
          "quantity": 2,
          "unitPrice": 16.89,
          "totalPrice": 33.78,
          "ageVerificationRequired": true
        }
      ],
      "subtotal": 33.78,
      "tax": 2.36,
      "deliveryFee": 4.99,
      "tip": 5.00,
      "total": 46.13,
      "createdAt": "2025-11-14T10:30:00Z",
      "estimatedPickupTime": "2025-11-14T11:00:00Z",
      "specialInstructions": "Ring doorbell",
      "dasherInfo": {
        "name": "Jane Driver",
        "phone": "+1-555-0456",
        "trackingUrl": "https://doordash.com/track/..."
      }
    }
  ],
  "total": 15
}
```

#### GET /api/orders/:id
Get specific order details

**Parameters:**
- `id` (path) - Order ID

**Response:**
```json
{
  "id": "ord-12345",
  "orderNumber": "DD-2024-001",
  "channel": "DOORDASH",
  "status": "ACCEPTED",
  "statusHistory": [
    {
      "status": "NEW",
      "timestamp": "2025-11-14T10:30:00Z",
      "userId": null
    },
    {
      "status": "ACCEPTED",
      "timestamp": "2025-11-14T10:31:15Z",
      "userId": "user-123",
      "username": "manager1"
    }
  ],
  "items": [...],
  "payments": [
    {
      "method": "CARD",
      "amount": 46.13,
      "status": "COMPLETED",
      "cardBrand": "visa",
      "last4": "4242"
    }
  ],
  "ageVerification": {
    "required": true,
    "verified": true,
    "method": "ID_SCAN",
    "verifiedBy": "user-123",
    "verifiedAt": "2025-11-14T10:35:00Z",
    "customerAge": 28
  }
}
```

#### PATCH /api/orders/:id/status
Update order status

**Parameters:**
- `id` (path) - Order ID

**Request Body:**
```json
{
  "status": "PREPARING"
}
```

**Valid Status Transitions:**
- `NEW` → `ACCEPTED` or `CANCELLED`
- `ACCEPTED` → `PREPARING` or `CANCELLED`
- `PREPARING` → `READY` or `CANCELLED`
- `READY` → `PICKED_UP` or `CANCELLED`
- `PICKED_UP` → `COMPLETED`

**Response:**
```json
{
  "id": "ord-12345",
  "status": "PREPARING",
  "updatedAt": "2025-11-14T10:32:00Z",
  "updatedBy": "user-123"
}
```

#### POST /api/orders/:id/verify-age
Record age verification for alcohol delivery

**Parameters:**
- `id` (path) - Order ID

**Request Body:**
```json
{
  "method": "ID_SCAN",
  "customerAge": 28,
  "idType": "DRIVERS_LICENSE",
  "idNumber": "D123-456-789",
  "idState": "FL",
  "photoUrl": "data:image/jpeg;base64,..."
}
```

**Response:**
```json
{
  "verified": true,
  "timestamp": "2025-11-14T10:35:00Z",
  "verifiedBy": "user-123",
  "auditId": "audit-789"
}
```

---

### POS Cart Management

#### POST /api/cart
Create a new shopping cart (start transaction)

**Request Body:**
```json
{
  "terminalId": "POS-001",
  "cashierId": "user-123",
  "channel": "IN_STORE"
}
```

**Response:**
```json
{
  "cartId": "cart-abc123",
  "terminalId": "POS-001",
  "createdAt": "2025-11-14T10:00:00Z",
  "items": [],
  "subtotal": 0,
  "tax": 0,
  "total": 0
}
```

#### POST /api/cart/:cartId/items
Add item to cart by barcode

**Parameters:**
- `cartId` (path) - Cart ID

**Request Body:**
```json
{
  "barcode": "012345678901",
  "quantity": 2,
  "priceOverride": null
}
```

**Response:**
```json
{
  "cartId": "cart-abc123",
  "items": [
    {
      "barcode": "012345678901",
      "name": "Corona Extra 6-Pack",
      "quantity": 2,
      "unitPrice": 12.99,
      "lineTotal": 25.98,
      "taxable": true,
      "promotionsApplied": []
    }
  ],
  "subtotal": 25.98,
  "tax": 1.82,
  "total": 27.80,
  "promotions": []
}
```

#### PATCH /api/cart/:cartId/items/:barcode
Update item quantity in cart

**Parameters:**
- `cartId` (path) - Cart ID
- `barcode` (path) - Product barcode

**Request Body:**
```json
{
  "quantity": 3
}
```

**Response:**
```json
{
  "cartId": "cart-abc123",
  "items": [
    {
      "barcode": "012345678901",
      "quantity": 3,
      "lineTotal": 38.97
    }
  ],
  "subtotal": 38.97,
  "tax": 2.73,
  "total": 41.70
}
```

#### DELETE /api/cart/:cartId/items/:barcode
Remove item from cart

**Parameters:**
- `cartId` (path) - Cart ID
- `barcode` (path) - Product barcode

**Response:**
```json
{
  "cartId": "cart-abc123",
  "items": [],
  "subtotal": 0,
  "tax": 0,
  "total": 0
}
```

#### GET /api/cart/:cartId
Get current cart contents

**Parameters:**
- `cartId` (path) - Cart ID

**Response:**
```json
{
  "cartId": "cart-abc123",
  "items": [...],
  "subtotal": 41.70,
  "tax": 2.92,
  "total": 44.62,
  "promotionsApplied": [
    {
      "id": "promo-1",
      "name": "Beer Sale",
      "discount": 3.00
    }
  ]
}
```

#### DELETE /api/cart/:cartId
Void entire cart (requires manager approval)

**Parameters:**
- `cartId` (path) - Cart ID

**Request Body:**
```json
{
  "reason": "CUSTOMER_CHANGED_MIND",
  "managerPin": "5678",
  "managerId": "user-456"
}
```

**Response:**
```json
{
  "cartId": "cart-abc123",
  "status": "VOIDED",
  "voidedAt": "2025-11-14T10:15:00Z",
  "voidedBy": "user-456",
  "reason": "CUSTOMER_CHANGED_MIND",
  "auditId": "audit-123"
}
```

---

### Payment Processing

#### POST /api/payment/card
Process card payment via Stripe Terminal

**Request Body:**
```json
{
  "cartId": "cart-abc123",
  "amount": 44.62,
  "terminalId": "tmr_abc123",
  "paymentMethod": "CARD_PRESENT"
}
```

**Response:**
```json
{
  "paymentId": "pay-xyz789",
  "status": "SUCCEEDED",
  "amount": 44.62,
  "cardBrand": "visa",
  "last4": "4242",
  "receiptUrl": "https://stripe.com/receipt/...",
  "transactionId": "txn-12345",
  "timestamp": "2025-11-14T10:20:00Z"
}
```

#### POST /api/payment/cash
Process cash payment with change calculation

**Request Body:**
```json
{
  "cartId": "cart-abc123",
  "amount": 44.62,
  "tendered": 50.00
}
```

**Response:**
```json
{
  "paymentId": "pay-xyz790",
  "status": "COMPLETED",
  "amount": 44.62,
  "tendered": 50.00,
  "change": 5.38,
  "changeDue": {
    "twenties": 0,
    "tens": 0,
    "fives": 1,
    "ones": 0,
    "quarters": 1,
    "dimes": 1,
    "nickels": 0,
    "pennies": 3
  },
  "transactionId": "txn-12346",
  "timestamp": "2025-11-14T10:20:00Z"
}
```

#### POST /api/payment/cash-drawer/open
Open cash drawer (requires authentication)

**Response:**
```json
{
  "status": "opened",
  "timestamp": "2025-11-14T10:20:00Z",
  "userId": "user-123"
}
```

#### GET /api/payment/terminals
List available Stripe Terminal readers

**Response:**
```json
{
  "terminals": [
    {
      "id": "tmr_abc123",
      "label": "POS Terminal 1",
      "status": "online",
      "location": "STORE_001",
      "deviceType": "verifone_P400",
      "serialNumber": "VP400-12345"
    }
  ]
}
```

---

### Receipt Printing

#### POST /api/receipt/print
Print receipt for completed transaction

**Request Body:**
```json
{
  "orderId": "ord-12345",
  "printerVendorId": "0x04b8",
  "printerProductId": "0x0e15",
  "copies": 1
}
```

**Response:**
```json
{
  "status": "printed",
  "timestamp": "2025-11-14T10:21:00Z",
  "receiptId": "rcpt-789"
}
```

---

### Elistar Integration

#### POST /api/elistar/import
Import NAXML file from Elistar back-office

**Headers:**
- `Content-Type: application/xml`
- `X-Elistar-Secret: {IMPORT_SECRET}`

**Request Body:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<NAXMLRequest>
  <Items>
    <Item>
      <ItemCode>012345678901</ItemCode>
      <Description>Corona Extra 6-Pack</Description>
      <RegularPrice>12.99</RegularPrice>
      <MerchandiseCode>BEER</MerchandiseCode>
      <Age>21</Age>
    </Item>
  </Items>
</NAXMLRequest>
```

**Response:**
```json
{
  "status": "success",
  "imported": {
    "products": 150,
    "promotions": 12,
    "merchandiseCodes": 25,
    "itemLists": 8
  },
  "timestamp": "2025-11-14T10:00:00Z",
  "processingTime": "2.5s"
}
```

#### POST /api/elistar/export
Export transaction journal to Elistar

**Request Body:**
```json
{
  "startDate": "2025-11-14T00:00:00Z",
  "endDate": "2025-11-14T23:59:59Z",
  "storeId": "STORE_001"
}
```

**Response:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<NAXMLResponse>
  <Transactions>
    <Transaction>
      <TransactionId>txn-12345</TransactionId>
      <BusinessDate>2025-11-14</BusinessDate>
      <TotalAmount>44.62</TotalAmount>
      <LineItems>
        <LineItem>
          <ItemCode>012345678901</ItemCode>
          <Quantity>3</Quantity>
          <UnitPrice>12.99</UnitPrice>
        </LineItem>
      </LineItems>
    </Transaction>
  </Transactions>
</NAXMLResponse>
```

---

### Channel Integration

#### POST /api/channels/doordash/sync-menu
Sync product menu to DoorDash

**Request Body:**
```json
{
  "storeId": "STORE_001",
  "includeOutOfStock": false
}
```

**Response:**
```json
{
  "status": "synced",
  "itemsSynced": 150,
  "timestamp": "2025-11-14T10:00:00Z",
  "doordashStoreId": "dd-store-123"
}
```

#### POST /api/channels/uber/sync-menu
Sync product menu to Uber Eats

**Request Body:**
```json
{
  "storeId": "STORE_001",
  "includeOutOfStock": false
}
```

**Response:**
```json
{
  "status": "synced",
  "itemsSynced": 150,
  "timestamp": "2025-11-14T10:00:00Z",
  "uberStoreId": "uber-store-456"
}
```

---

## Webhooks

### DoorDash Order Webhook

**Endpoint (configured in DoorDash):** `POST /webhooks/doordash/orders`

**Headers:**
- `X-DoorDash-Signature` - HMAC signature for verification
- `X-DoorDash-Timestamp` - Request timestamp

**Payload:**
```json
{
  "event_type": "order.created",
  "order_id": "dd-ord-789",
  "store_id": "dd-store-123",
  "customer": {
    "name": "John Doe",
    "phone": "+1-555-0123"
  },
  "delivery_address": {
    "street": "123 Main St",
    "city": "Ocala",
    "state": "FL",
    "zip": "34470"
  },
  "items": [
    {
      "external_id": "012345678901",
      "name": "Corona Extra 6-Pack",
      "quantity": 2,
      "price": 1689
    }
  ],
  "subtotal": 3378,
  "tax": 236,
  "delivery_fee": 499,
  "tip": 500,
  "total": 4613,
  "dasher": {
    "name": "Jane Driver",
    "phone": "+1-555-0456"
  }
}
```

**Response:**
```json
{
  "status": "accepted",
  "order_id": "ord-12345",
  "estimated_ready_time": "2025-11-14T11:00:00Z"
}
```

### Uber Eats Order Webhook

**Endpoint (configured in Uber):** `POST /webhooks/uber/orders`

**Headers:**
- `X-Uber-Signature` - HMAC signature for verification
- `X-Uber-Timestamp` - Request timestamp

**Payload:**
```json
{
  "event_type": "orders.notification",
  "meta": {
    "user_id": "uber-user-123",
    "resource_id": "uber-ord-456"
  },
  "type": "ORDER_CREATED",
  "order": {
    "id": "uber-ord-456",
    "display_id": "#123",
    "eater": {
      "first_name": "John",
      "phone": "+15550123"
    },
    "cart": {
      "items": [
        {
          "id": "012345678901",
          "title": "Corona Extra 6-Pack",
          "quantity": 2,
          "price": {
            "unit_price": {
              "amount": 1624
            },
            "total": {
              "amount": 3248
            }
          }
        }
      ]
    },
    "payment": {
      "charges": {
        "total": {
          "amount": 4520
        }
      }
    }
  }
}
```

**Response:**
```json
{
  "status": "accepted",
  "estimated_ready_time_in_seconds": 1800
}
```

---

## Error Handling

### Standard Error Response
```json
{
  "error": {
    "code": "PRODUCT_NOT_FOUND",
    "message": "Product with barcode 012345678901 not found",
    "details": {
      "barcode": "012345678901",
      "timestamp": "2025-11-14T10:00:00Z"
    }
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Invalid or missing authentication token |
| `FORBIDDEN` | 403 | Insufficient permissions for operation |
| `PRODUCT_NOT_FOUND` | 404 | Product not found by barcode |
| `ORDER_NOT_FOUND` | 404 | Order ID not found |
| `CART_NOT_FOUND` | 404 | Cart ID not found |
| `INVALID_STATUS_TRANSITION` | 400 | Invalid order status change |
| `INSUFFICIENT_INVENTORY` | 400 | Not enough stock for purchase |
| `PAYMENT_FAILED` | 402 | Payment processing failed |
| `AGE_VERIFICATION_REQUIRED` | 403 | Age verification needed |
| `MANAGER_OVERRIDE_REQUIRED` | 403 | Manager approval needed |
| `INVALID_PIN` | 401 | Incorrect PIN entered |
| `ACCOUNT_LOCKED` | 403 | Account locked due to failed attempts |
| `SESSION_EXPIRED` | 401 | Session timeout, re-authentication required |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Rate Limiting

- **Default Limit**: 100 requests per minute per IP
- **Burst Limit**: 200 requests per minute
- **Headers:**
  - `X-RateLimit-Limit: 100`
  - `X-RateLimit-Remaining: 95`
  - `X-RateLimit-Reset: 1699977600`

**Rate Limit Exceeded Response:**
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later.",
    "retryAfter": 60
  }
}
```

---

## Response Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 204 | No Content (success with no response body) |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (authentication required) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 409 | Conflict (resource already exists) |
| 422 | Unprocessable Entity (semantic error) |
| 429 | Too Many Requests (rate limit) |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

---

## Best Practices

1. **Authentication**: Always include JWT token in Authorization header
2. **Idempotency**: Use unique `idempotency-key` header for payment requests
3. **Retry Logic**: Implement exponential backoff for 5xx errors
4. **Webhooks**: Verify signatures to prevent spoofing
5. **Pagination**: Use `limit` and `offset` for large datasets
6. **Caching**: Use ETags and `If-None-Match` headers where supported
7. **Timeouts**: Set reasonable timeouts (30s for API calls)
8. **Error Handling**: Always check error codes and handle gracefully

---

**API Version**: 1.0
**Last Updated**: 2025-11-14
**Contact**: support@opencommerce.local
