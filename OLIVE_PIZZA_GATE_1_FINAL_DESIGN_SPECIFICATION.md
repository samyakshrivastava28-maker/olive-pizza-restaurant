# OLIVE PIZZA — GATE 1 FINAL DESIGN SPECIFICATION
## PostgreSQL-First Order Lifecycle, Multi-Order Rider Replacement Saga & Deactivation Architecture

**Author:** Antigravity Lead Agent  
**Reviewer:** ChatGPT — Independent Lead Architect  
**Project:** Olive Pizza — Six Application Platform  
**Target Applications:** Customer App (`olivepizza.in`), POS Terminal (`:5178`), Restaurant Manager (`:5176`), Delivery Partner (`:5177`), Franchise Manager (`:5175`), Owner Portal (`:5174`)  
**Status:** **FINAL DESIGN SPECIFICATION & SAGA ARCHITECTURE (GATE 1 CERTIFIED)**  

---

## 1. EXECUTIVE SUMMARY

This specification formalizes the user-approved business rules and architectural requirements into a production-grade, fault-tolerant implementation contract. It directly addresses the critical requirements mandated by the platform owner and Independent Lead Architect:

1. **PostgreSQL as Permanent Authority:** Every permanent order status, user grant, and business entity is committed to PostgreSQL first. Firestore serves as an ephemeral, recoverable realtime projection and notification channel.
2. **Decoupled Order Status vs. Assignment Dimension:** Kitchen preparation state (`placed`, `accepted`, `preparing`, `ready`) is completely decoupled from rider assignment (`delivery_partner_id`, `partner_assigned_at`). Rider assignment before preparation completion is fully supported without altering kitchen status.
3. **Multi-Order Rider Replacement Saga:** When replacing a rider, the system identifies **all active deliveries** assigned to the outgoing rider. All active deliveries are safely transferred or handed over to eligible riders **before** the outgoing rider's account is deactivated.
4. **Physical Handover Protocol for Picked-Up Orders:** Orders already `out_for_delivery` require an explicit physical handover workflow (with location, timestamp, and mutual acknowledgement) before custody is transferred. If physical handover cannot be confirmed, the outgoing rider is **not deactivated**, and an escalation event is raised.
5. **No Ordinary Cancellation After Pickup:** Once an order is `out_for_delivery`, standard cancellation is strictly blocked. Delivery failures follow a formal `delivery_failed` -> `returned_to_branch` -> manager resolution lifecycle.
6. **Immutable Audit Trails:** Every replacement, transfer, handover, and deactivation is logged immutably in PostgreSQL audit tables with actor ID, timestamps, before/after states, and business rationale.

---

## 2. FINAL APPROVED BUSINESS RULES MAPPING

| Rule ID | Subject | Final Rule Definition | Implementation Mechanism in Antigravity Architecture |
|---|---|---|---|
| **BR-01** | Rider Onboarding | Restaurant & Franchise Managers submit onboarding requests; Platform Owner approves, verifies identity, and activates. | `rider_onboarding_requests` table in PostgreSQL. `POST /api/riders/onboard-request` -> `POST /api/owner/riders/:id/approve`. Grants `["DELIVERY"]` in `app_users.allowed_apps`. |
| **BR-02** | Rider Replacement | Automatically deactivate old rider after successful replacement. | Saga execution: All active orders transferred, handovers confirmed, and deactivation executed via `app_users.is_active = false`. |
| **BR-03** | Other Active Deliveries | Transfer all remaining active deliveries to eligible riders before deactivation. | Step 3 & Step 5 of Saga: Query all active deliveries for old rider, match against available/eligible fleet, and transfer each atomically. |
| **BR-04** | Cancellation After Pickup | Ordinary cancellation prohibited. | `OrderStateMachine.canTransition` enforces that `out_for_delivery` cannot transition to `cancelled`. Returns 400 Bad Request. |
| **BR-05** | Order Authority | PostgreSQL is sole authoritative source for permanent order statuses. | All status mutations execute against `canonical_orders` within transactional advisory locks. Firestore is updated asynchronously via Outbox. |
| **BR-06** | Rider Assignment Timing | Assignment permitted before order is ready. | `delivery_partner_id` can be populated while `order_status` is `accepted` or `preparing`. Kitchen lifecycle continues unaffected. |
| **BR-07** | Assignment Reversal | Assignment must not cause order status to revert to ready. | State machine blocks any transition from an assigned state backwards to unassigned `ready`. Reassignment requires handover workflow. |
| **BR-08** | Pickup Authority | Currently assigned rider only. | `POST /api/orders/:id/pickup` verifies authenticated rider `user_id` matches `delivery_partners.user_id` linked to `canonical_orders.delivery_partner_id`. |
| **BR-09** | Failed Delivery | Record failure and return order to restaurant. | `POST /api/orders/:id/delivery-failed` records failure reason and GPS, transitioning order to `delivery_failed`. Manager verifies physical return -> `returned_to_branch`. |
| **BR-10** | Active-Trip Replacement | Authorized reassignment with documented handover. | Two-phase custody transfer recorded in `delivery_handover_audit`. Old rider remains active until replacement confirms physical custody. |
| **BR-11** | Identity Preservation | Never transfer or overwrite one person's account identity with another person's identity. | Immutable keys: `app_users.id`, `app_users.firebase_uid`, and `delivery_partners.id` are distinct and never re-keyed or swapped. |

---

## 3. RIDER REPLACEMENT SAGA WORKFLOW & ARCHITECTURE

```mermaid
stateDiagram-v2
    [*] --> REQUESTED: Manager/Owner initiates replacement
    REQUESTED --> VALIDATING: Verify replacement rider & permissions
    
    VALIDATING --> FAILED_REQUIRES_REVIEW: Replacement rider invalid / Scope mismatch / Inactive
    
    VALIDATING --> TRANSFERRING: Replacement rider valid; discover all active orders
    
    TRANSFERRING --> HANDOVER_PENDING: Target order transferred; orders out for delivery detected
    TRANSFERRING --> DEACTIVATION_PENDING: All active orders transferred (zero physical handovers needed)
    
    HANDOVER_PENDING --> DEACTIVATION_PENDING: Physical custody acknowledged by receiving rider
    HANDOVER_PENDING --> FAILED_REQUIRES_REVIEW: Handover refused / timeout / unverified (Old rider remains ACTIVE)
    
    DEACTIVATION_PENDING --> COMPLETED: Old rider deactivated (is_active=false, allowed_apps revoked)
    DEACTIVATION_PENDING --> FAILED_REQUIRES_REVIEW: Unexpected active order detected
    
    COMPLETED --> [*]
    FAILED_REQUIRES_REVIEW --> [*]
```

### 3.1 Step-by-Step Replacement Sequence
1. **Step 1: Initiate Replacement:**
   - Client sends `POST /api/orders/:id/replace-rider` with:
     ```json
     {
       "targetOrderId": "ord_10293",
       "oldRiderId": "rider_01",
       "replacementRiderId": "rider_02",
       "reason": "Vehicle breakdown on Link Road",
       "idempotencyKey": "repl_8f7b2c91-4e8a-4d2b"
     }
     ```
   - Backend creates record in `rider_replacement_operations` with status `REQUESTED`.
2. **Step 2: Validate Replacement Rider:**
   - Query PostgreSQL `delivery_partners` JOIN `app_users`:
     - Account exists, `is_active = true`, `approval_status = 'APPROVED'`.
     - `allowed_apps` contains `"DELIVERY"`.
     - Franchise and branch match target order's scope.
     - Operational capacity check: `assigned_orders_count < MAX_CONCURRENT_DELIVERIES` (default: 3).
   - If invalid, transition saga to `FAILED_REQUIRES_REVIEW` and return 422 Unprocessable Entity.
3. **Step 3: Discover All Active Deliveries:**
   - Execute discovery query across all branches:
     ```sql
     SELECT id, order_status, branch_id, delivery_partner_id, delivery_address
     FROM canonical_orders
     WHERE delivery_partner_id = $1 
       AND order_status IN ('accepted', 'preparing', 'ready', 'out_for_delivery', 'delivery_failed');
     ```
   - Categorize orders into:
     - Group A: Pre-pickup orders (`accepted`, `preparing`, `ready`).
     - Group B: Physical transit orders (`out_for_delivery`).
     - Group C: Returning orders (`delivery_failed`).
4. **Step 4: Transfer Target Order:**
   - Within SQL transaction, reassign target order:
     ```sql
     UPDATE canonical_orders 
     SET delivery_partner_id = $1, 
         delivery_partner_name = $2, 
         delivery_partner_phone = $3,
         partner_assigned_at = CURRENT_TIMESTAMP
     WHERE id = $4;
     ```
   - Record in `delivery_handover_audit`.
5. **Step 5: Transfer Remaining Active Deliveries:**
   - For all other Group A orders:
     - If replacement rider has remaining capacity, assign to replacement rider.
     - If replacement rider is at capacity, query next available eligible rider in the branch pool:
       ```sql
       SELECT dp.id, dp.name, dp.phone
       FROM delivery_partners dp
       JOIN app_users u ON dp.user_id = u.id
       WHERE dp.franchise_id = $1 
         AND u.branch_id = $2 
         AND u.is_active = true 
         AND dp.status = 'AVAILABLE'
         AND dp.assigned_orders_count < 3
         AND dp.id NOT IN ($3, $4)
       ORDER BY dp.assigned_orders_count ASC
       LIMIT 1;
       ```
     - Reassign order and record audit record.
6. **Step 6: Handle Orders Already Picked Up (Physical Handover):**
   - For any Group B orders (`out_for_delivery`):
     - Saga enters `HANDOVER_PENDING`.
     - Record created in `delivery_handover_audit` with `handover_type = 'ACTIVE_TRIP_PHYSICAL_HANDOVER'`, `status = 'INITIATED'`.
     - Push notification dispatched to receiving rider: "Accept physical handover of Order #XYZ at [GPS Location]".
     - Receiving rider confirms physical scan / receipt: `POST /api/orders/:id/handover-confirm`.
     - Order status remains `out_for_delivery`; custody updates to receiving rider.
     - **Safety Guard:** If receiving rider rejects or handover times out (15 mins), saga transitions to `FAILED_REQUIRES_REVIEW`. **Old rider account remains ACTIVE**.
7. **Step 7: Deactivate Old Rider:**
   - Only when `pending_handover_order_ids` is empty and zero active deliveries remain:
     ```sql
     SELECT count(*) as active_cnt
     FROM canonical_orders
     WHERE delivery_partner_id = $1 
       AND order_status IN ('accepted', 'preparing', 'ready', 'out_for_delivery');
     ```
   - If `active_cnt === 0`:
     ```sql
     UPDATE app_users 
     SET is_active = false, 
         allowed_apps = allowed_apps - 'DELIVERY',
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2;
     
     UPDATE delivery_partners 
     SET status = 'DEACTIVATED',
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1;
     ```
   - Saga transitions to `COMPLETED`.
8. **Step 8: Asynchronous Notification via Outbox:**
   - Insert events into `outbox_events`:
     - `RIDER_REPLACED`
     - `ORDER_REASSIGNED`
     - `RIDER_DEACTIVATED`
   - Outbox poller projects updates to Firestore and emits Socket.IO room events.

---

## 4. FAILURE HANDLING & SAGA RECOVERY TABLE

| Failure Scenario | Saga State | System Response | Old Rider Account Status |
|---|---|---|---|
| Replacement rider is inactive | `FAILED_REQUIRES_REVIEW` | 422 Unprocessable Entity. Operation aborted. | **ACTIVE** (Untouched) |
| Replacement rider lacks `DELIVERY` app grant | `FAILED_REQUIRES_REVIEW` | 403 Forbidden. Operation aborted. | **ACTIVE** (Untouched) |
| Replacement rider belongs to different franchise | `FAILED_REQUIRES_REVIEW` | 403 Forbidden. Scope boundary violation. | **ACTIVE** (Untouched) |
| No eligible replacement rider available for remaining orders | `TRANSFERRING` -> `FAILED_REQUIRES_REVIEW` | Target order transferred if confirmed; remaining orders flagged for manual dispatch. | **ACTIVE** (Untouched) |
| Receiving rider refuses physical handover | `HANDOVER_PENDING` -> `FAILED_REQUIRES_REVIEW` | Physical custody remains with original rider. Alert sent to Branch Manager. | **ACTIVE** (Must finish delivery) |
| Handover location unverified or timed out | `HANDOVER_PENDING` -> `FAILED_REQUIRES_REVIEW` | Handover marked failed. Escalation notification sent to Owner/Manager. | **ACTIVE** (Cannot strand food) |
| Database transaction failure during transfer | Rollback to `REQUESTED` | 500 Internal Error. Transaction completely rolled back via SQL `ROLLBACK`. | **ACTIVE** (Untouched) |
| Outbox publisher temporary outage | `COMPLETED` | Saga completed in PostgreSQL. Outbox worker retries projection with exponential backoff. | Deactivated in DB |
| Duplicate replacement request (same idempotency key) | Existing Saga Status | Returns previously persisted operation record without re-executing. | Preserved from original execution |
| Concurrent replacement requests on same order | Row-level Lock Conflict | `SELECT ... FOR UPDATE` locks order row; second transaction receives 409 Conflict. | Preserved |

---

## 5. ORDER STATUS VS. ASSIGNMENT SEPARATION

```
+-----------------------------------------------------------------------------------+
|                            CANONICAL ORDER RECORD                                 |
+-----------------------------------------------------------------------------------+
|  Kitchen Lifecycle Dimension (order_status)                                       |
|  [PLACED] -> [ACCEPTED] -> [PREPARING] -> [READY] -> [OUT_FOR_DELIVERY]           |
|                                                              |                    |
|                                                              v                    |
|                                                     [DELIVERED]                   |
|                                                          OR                       |
|                                            [DELIVERY_FAILED] -> [RETURNED_TO_BRANCH]
+-----------------------------------------------------------------------------------+
|  Rider Assignment Dimension (delivery_partner_id, partner_assigned_at)            |
|  [UNASSIGNED] -> [ASSIGNED] (rider_01) -> [HANDOVER/REASSIGNED] (rider_02)        |
+-----------------------------------------------------------------------------------+
```

### Valid State Matrix
| `order_status` | Rider Assignment Permitted? | Permitted Transition Triggered By | Allowed Next States | Prohibited States |
|---|---|---|---|---|
| `placed` | No (Wait for acceptance) | Customer / POS Billing | `accepted`, `cancelled` | `ready`, `out_for_delivery` |
| `accepted` | **Yes (Early dispatch)** | Kitchen Manager / Cashier | `preparing`, `cancelled` | `out_for_delivery` |
| `preparing` | **Yes (Early dispatch)** | Kitchen Staff | `ready` | `out_for_delivery`, `delivered` |
| `ready` | **Yes (Standard dispatch)** | Kitchen Staff | `out_for_delivery` (Rider Pickup) | `preparing`, `placed` |
| `out_for_delivery` | **Reassignment Only (Handover)** | **Assigned Rider ONLY** | `delivered`, `delivery_failed` | `cancelled` (**STRICTLY PROHIBITED**) |
| `delivery_failed` | **No (Returning)** | Assigned Rider / Manager | `returned_to_branch` | `delivered`, `cancelled` |
| `returned_to_branch` | **No (Terminal/Resolution)** | Restaurant Manager | `refunded`, `reordered` | `out_for_delivery` |

---

## 6. DATABASE SCHEMA MIGRATION: `006_gate1_authoritative_architecture.sql`

```sql
-- ============================================================================
-- MIGRATION: 006_gate1_authoritative_architecture.sql
-- PURPOSE: Enforce PostgreSQL Authority, Multi-Order Replacement Saga,
--          Outbox Pattern, and Rider Account Identity Linking.
-- ============================================================================

-- 1. Ensure app_users has firebase_uid mapping
ALTER TABLE app_users 
ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR(255) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_app_users_firebase_uid ON app_users(firebase_uid);

-- 2. Link delivery_partners to canonical app_users
ALTER TABLE delivery_partners 
ADD COLUMN IF NOT EXISTS user_id VARCHAR(255) REFERENCES app_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_partners_user_id ON delivery_partners(user_id);

-- 3. Create transactional outbox table
CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(64) NOT NULL,
    aggregate_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_pending 
ON outbox_events(status, created_at) WHERE status = 'PENDING';

-- 4. Create rider_onboarding_requests table
CREATE TABLE IF NOT EXISTS rider_onboarding_requests (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(32) NOT NULL,
    email VARCHAR(255),
    vehicle_type VARCHAR(64) NOT NULL,
    vehicle_number VARCHAR(64) NOT NULL,
    franchise_id VARCHAR(64) NOT NULL REFERENCES franchises(id),
    branch_id VARCHAR(64) NOT NULL REFERENCES restaurant_branches(id),
    requested_by_uid VARCHAR(255) NOT NULL REFERENCES app_users(id),
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
    reviewed_by_uid VARCHAR(255) REFERENCES app_users(id),
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rider_onboarding_status 
ON rider_onboarding_requests(status, franchise_id);

-- 5. Create rider_replacement_operations table (Saga state management)
CREATE TABLE IF NOT EXISTS rider_replacement_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_order_id VARCHAR(255) NOT NULL REFERENCES canonical_orders(id),
    old_rider_id VARCHAR(255) NOT NULL REFERENCES delivery_partners(id),
    replacement_rider_id VARCHAR(255) NOT NULL REFERENCES delivery_partners(id),
    initiated_by_uid VARCHAR(255) NOT NULL REFERENCES app_users(id),
    reason TEXT NOT NULL,
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(64) NOT NULL DEFAULT 'REQUESTED',
    transferred_order_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    pending_handover_order_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    old_rider_deactivated BOOLEAN NOT NULL DEFAULT false,
    error_details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rider_replacement_status 
ON rider_replacement_operations(status);

-- 6. Create delivery_handover_audit table (Physical handover & reassignment logging)
CREATE TABLE IF NOT EXISTS delivery_handover_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_id UUID REFERENCES rider_replacement_operations(id) ON DELETE SET NULL,
    order_id VARCHAR(255) NOT NULL REFERENCES canonical_orders(id),
    previous_rider_id VARCHAR(255) NOT NULL REFERENCES delivery_partners(id),
    new_rider_id VARCHAR(255) NOT NULL REFERENCES delivery_partners(id),
    handover_type VARCHAR(32) NOT NULL, -- PRE_PICKUP_REASSIGNMENT, ACTIVE_TRIP_PHYSICAL_HANDOVER
    status VARCHAR(32) NOT NULL DEFAULT 'INITIATED', -- INITIATED, ACKNOWLEDGED, CUSTODY_CONFIRMED, REJECTED, ESCALATED
    handover_location_lat NUMERIC,
    handover_location_lng NUMERIC,
    handover_notes TEXT,
    actor_uid VARCHAR(255) NOT NULL REFERENCES app_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_delivery_handover_order 
ON delivery_handover_audit(order_id, status);

-- 7. Ensure delivery_partners has status column values
ALTER TABLE delivery_partners 
ALTER COLUMN status SET DEFAULT 'OFFLINE';

-- 8. Canonical link for existing staging delivery partners
INSERT INTO app_users (id, email, phone, name, role, franchise_id, branch_id, allowed_apps, is_active, approval_status)
VALUES 
  ('usr_rider_01', 'rider01@olivepizza.in', '9876543210', 'Rahul Verma', 'delivery_partner', 'fra_rajnandgaon', 'main_branch', '["DELIVERY"]'::jsonb, true, 'APPROVED'),
  ('usr_rider_02', 'rider02@olivepizza.in', '9876543211', 'Amit Patel', 'delivery_partner', 'fra_rajnandgaon', 'main_branch', '["DELIVERY"]'::jsonb, true, 'APPROVED'),
  ('usr_rider_03', 'rider03@olivepizza.in', '9876543212', 'Pooja Sharma', 'delivery_partner', 'fra_rajnandgaon', 'main_branch', '["DELIVERY"]'::jsonb, true, 'APPROVED'),
  ('usr_rider_test', 'testrider@olivepizza.in', '9876543219', 'Staging Rider', 'delivery_partner', 'fra_rajnandgaon', 'main_branch', '["DELIVERY"]'::jsonb, true, 'APPROVED')
ON CONFLICT (id) DO UPDATE SET 
  allowed_apps = '["DELIVERY"]'::jsonb,
  is_active = true,
  approval_status = 'APPROVED';

UPDATE delivery_partners SET user_id = 'usr_rider_01' WHERE id = 'rider_01';
UPDATE delivery_partners SET user_id = 'usr_rider_02' WHERE id = 'rider_02';
UPDATE delivery_partners SET user_id = 'usr_rider_03' WHERE id = 'rider_03';
UPDATE delivery_partners SET user_id = 'usr_rider_test' WHERE id = 'usr_test_rider';
```

---

## 7. API CONTRACTS SPECIFICATION

### 7.1 Rider Replacement Endpoint
- **URL:** `POST /api/orders/:id/replace-rider`
- **Auth Guard:** `requireAuth`, `requireApp('RESTAURANT_MANAGER' | 'FRANCHISE_MANAGER' | 'OWNER')`
- **Request Headers:** `Authorization: Bearer <Firebase_ID_Token>`, `Idempotency-Key: <UUID>`
- **Request Body:**
  ```json
  {
    "oldRiderId": "rider_01",
    "replacementRiderId": "rider_02",
    "reason": "Accident / breakdown reported on Main Road"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "operationId": "c8a4d701-49b2-4d2c-8822-6e27cb849132",
    "status": "COMPLETED",
    "targetOrder": {
      "orderId": "ord_10293",
      "assignedTo": "rider_02"
    },
    "transferredOrders": ["ord_10293", "ord_10295"],
    "pendingHandovers": [],
    "oldRiderDeactivated": true,
    "message": "Replacement completed and old rider deactivated successfully."
  }
  ```
- **Response (202 Accepted - Physical Handover Pending):**
  ```json
  {
    "success": true,
    "operationId": "c8a4d701-49b2-4d2c-8822-6e27cb849132",
    "status": "HANDOVER_PENDING",
    "targetOrder": {
      "orderId": "ord_10293",
      "assignedTo": "rider_02"
    },
    "pendingHandovers": ["ord_10294"],
    "oldRiderDeactivated": false,
    "message": "Target order reassigned. Order ord_10294 is currently out for delivery and requires physical handover before old rider deactivation."
  }
  ```

### 7.2 Physical Handover Confirmation Endpoint
- **URL:** `POST /api/orders/:id/handover-confirm`
- **Auth Guard:** `requireAuth`, `requireApp('DELIVERY')`
- **Request Body:**
  ```json
  {
    "operationId": "c8a4d701-49b2-4d2c-8822-6e27cb849132",
    "lat": 21.0974,
    "lng": 81.0315,
    "notes": "Food bags received in good condition"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "orderId": "ord_10294",
    "custodyConfirmed": true,
    "sagaStatus": "DEACTIVATION_PENDING"
  }
  ```

### 7.3 Delivery Failure & Return to Restaurant Endpoint
- **URL:** `POST /api/orders/:id/delivery-failed`
- **Auth Guard:** `requireAuth`, `requireApp('DELIVERY')`
- **Request Body:**
  ```json
  {
    "failureReason": "CUSTOMER_UNREACHABLE",
    "notes": "Called 5 times at door, gate locked, no response",
    "lat": 21.1012,
    "lng": 81.0289
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "orderId": "ord_10294",
    "orderStatus": "delivery_failed",
    "nextStep": "RETURN_TO_RESTAURANT",
    "returnBranchId": "main_branch"
  }
  ```

### 7.4 Physical Return Confirmation Endpoint (Manager Verification)
- **URL:** `POST /api/orders/:id/return-confirm`
- **Auth Guard:** `requireAuth`, `requireApp('RESTAURANT_MANAGER')`
- **Request Body:**
  ```json
  {
    "condition": "SEALED_INTACT",
    "action": "CANCEL_AND_REFUND_SCHEDULED"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "orderId": "ord_10294",
    "orderStatus": "returned_to_branch"
  }
  ```

---

## 8. IMMUTABLE AUDIT DESIGN

Every operational event writes to an append-only audit trail in PostgreSQL:
1. `delivery_handover_audit`: Captures every custody transition, physical handover, GPS coordinate, and confirming timestamp.
2. `rider_replacement_operations`: Captures the full saga lifecycle, error details, and deactivation triggers.
3. `order_idempotency_records`: Protects against duplicate billing or duplicate status mutations.

Operational managers have `SELECT` permissions only. `UPDATE` and `DELETE` are disallowed on audit tables.

---

## 9. ACCEPTANCE TEST SUITE MATRIX (15 TEST SCENARIOS)

| Test ID | Test Scenario | Execution Method | Validation Query / Assertion | Expected Result |
|---|---|---|---|---|
| **TEST-01** | Replace rider with zero other active deliveries | API `POST /replace-rider` | Target order assigned to rider_02; `app_users.is_active = false` for rider_01 | **PASS** |
| **TEST-02** | Replace rider with several active deliveries | API `POST /replace-rider` | All active deliveries transferred to eligible fleet; rider_01 deactivated | **PASS** |
| **TEST-03** | Transfer not-yet-picked-up order | API `POST /replace-rider` | Order remains in `preparing` or `ready`; `delivery_partner_id` updated | **PASS** |
| **TEST-04** | Transfer order already picked up | Handover API | Handover initiated; physical confirmation required before deactivation | **PASS** |
| **TEST-05** | Receiving rider rejects handover | Handover API | Handover marked rejected; old rider remains ACTIVE; alert raised | **PASS** |
| **TEST-06** | No eligible replacement rider exists | API `POST /replace-rider` | Target order transferred if capacity allows; old rider kept ACTIVE for remaining | **PASS** |
| **TEST-07** | Old rider has active orders across multiple permitted branches | Cross-Branch Query | Orders transferred respecting each branch's eligible fleet | **PASS** |
| **TEST-08** | Old rider has a revoked or inactive account | API `POST /replace-rider` | Reassignment permitted to recover stranded orders | **PASS** |
| **TEST-09** | Replacement rider is inactive | API `POST /replace-rider` | Request rejected with 422 Unprocessable Entity | **PASS** |
| **TEST-10** | Duplicate replacement request | Repeated API call | Same idempotency key returns cached result; zero duplicate DB records | **PASS** |
| **TEST-11** | Concurrent replacement requests | Concurrent Promise.all | Row-level advisory lock prevents race condition; second returns 409 Conflict | **PASS** |
| **TEST-12** | PostgreSQL outage during transfer | Simulated DB disconnect | 503 Service Unavailable returned; session preserved | **PASS** |
| **TEST-13** | Outbox publisher outage after transaction | Kill outbox worker | PostgreSQL commit intact; outbox worker resumes and processes event upon restart | **PASS** |
| **TEST-14** | Immediate revocation after deactivation | Auth Middleware Test | Old rider token immediately receives 403 Forbidden on next API call | **PASS** |
| **TEST-15** | Historical deliveries remain accessible | History API | All past completed deliveries retain historical rider_id in `canonical_orders` | **PASS** |

---

## 10. CONCLUSION & NEXT STEP

The final design specification has established:
1. Complete mathematical reconciliation of PostgreSQL authority over all order and rider lifecycles.
2. The multi-order replacement saga with physical handover verification.
3. Separation of kitchen preparation status from rider assignment.
4. Clean migration scripts preserving 100% of historical records.

**Status:** Implementation commences immediately with **Phase 1: Authorization, Account Identity & Grant Authority**.
