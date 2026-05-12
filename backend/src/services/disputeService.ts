import type { ConnectionPool } from 'mssql'

export const ORDER_DISPUTE_STATUSES = ['open', 'in_review', 'resolved', 'dismissed'] as const
export type OrderDisputeStatus = (typeof ORDER_DISPUTE_STATUSES)[number]

type OrderAccessRow = {
  id: string
  status: string
  user_id: string | null
  guest_email: string | null
}

const BLOCKED_ORDER_STATUSES = new Set(['draft', 'cancelled', 'refunded'])

function parseDisputeStatus(raw: string): OrderDisputeStatus | null {
  const s = raw.trim().toLowerCase()
  return (ORDER_DISPUTE_STATUSES as readonly string[]).includes(s) ? (s as OrderDisputeStatus) : null
}

/** Same ownership rules as returns: logged-in user must own the order, or guest must supply matching email. */
export async function assertCustomerCanAccessOrder(
  pool: ConnectionPool,
  orderId: string,
  jwtUserId: string | undefined,
  guestEmailNorm: string,
): Promise<OrderAccessRow> {
  const r = await pool
    .request()
    .input('oid', orderId)
    .query<OrderAccessRow>(`
      SELECT CAST(id AS NVARCHAR(36)) AS id, o.status,
        CAST(o.user_id AS NVARCHAR(36)) AS user_id, o.guest_email
      FROM dbo.orders o
      WHERE o.id = @oid
    `)
  const row = r.recordset[0]
  if (!row) {
    throw new Error('Order not found')
  }
  if (jwtUserId) {
    if (!row.user_id || row.user_id !== jwtUserId) {
      throw new Error('Forbidden')
    }
  } else {
    const ge = row.guest_email?.trim().toLowerCase() ?? ''
    if (!ge || !guestEmailNorm || ge !== guestEmailNorm) {
      throw new Error('Guest email must match the order')
    }
  }
  return row
}

export async function createOrderDispute(
  pool: ConnectionPool,
  input: {
    orderId: string
    userId: string | null
    guestEmailNorm: string | null
    reason: string
    description: string | null
    variantId?: string | null
  },
): Promise<{ disputeId: string }> {
  const reason = input.reason.trim()
  if (!reason || reason.length > 500) {
    throw new Error('Reason is required (max 500 characters)')
  }
  const desc = input.description?.trim() ?? ''
  if (desc.length > 4000) {
    throw new Error('Description must be at most 4000 characters')
  }

  const guestNorm = input.guestEmailNorm?.trim().toLowerCase() ?? ''
  const order = await assertCustomerCanAccessOrder(
    pool,
    input.orderId,
    input.userId ?? undefined,
    input.userId ? '' : guestNorm,
  )

  const st = String(order.status).toLowerCase()
  if (BLOCKED_ORDER_STATUSES.has(st)) {
    throw new Error('Disputes cannot be opened for cancelled, refunded, or draft orders')
  }

  const open = await pool.request().input('oid', input.orderId).query<{ n: number }>(`
    SELECT COUNT(*) AS n
    FROM dbo.order_disputes
    WHERE order_id = @oid AND status IN (N'open', N'in_review')
  `)
  if (Number(open.recordset[0]?.n ?? 0) > 0) {
    throw new Error('This order already has an open dispute. Wait for support to update it or contact us.')
  }

  const variantId = input.variantId?.trim() || null
  if (variantId) {
    const onOrder = await pool
      .request()
      .input('oid', input.orderId)
      .input('vid', variantId)
      .query<{ c: number }>(
        `SELECT COUNT_BIG(1) AS c FROM dbo.order_lines WHERE order_id = @oid AND variant_id = @vid`,
      )
    if (Number(onOrder.recordset[0]?.c ?? 0) === 0) {
      throw new Error('Selected item is not on this order')
    }
  }

  const ins = await pool
    .request()
    .input('oid', input.orderId)
    .input('uid', input.userId)
    .input('gen', input.userId ? null : guestNorm || null)
    .input('reason', reason)
    .input('desc', desc || null)
    .input('vid', variantId)
    .query<{ id: string }>(`
      INSERT INTO dbo.order_disputes (order_id, user_id, guest_email_norm, reason, description, status, variant_id)
      OUTPUT CAST(INSERTED.id AS NVARCHAR(36)) AS id
      VALUES (@oid, @uid, @gen, @reason, @desc, N'open', @vid)
    `)
  const disputeId = ins.recordset[0]?.id
  if (!disputeId) {
    throw new Error('Failed to create dispute')
  }
  return { disputeId }
}

export type CustomerDisputeRow = {
  disputeId: string
  status: string
  reason: string
  description: string | null
  admin_resolution_note: string | null
  created_at: Date
  updated_at: Date
  variant_id: string | null
  variant_sku: string | null
  product_name: string | null
}

export async function listDisputesForOrder(
  pool: ConnectionPool,
  orderId: string,
  userId: string | undefined,
  guestEmailNorm: string,
): Promise<CustomerDisputeRow[]> {
  await assertCustomerCanAccessOrder(pool, orderId, userId, userId ? '' : guestEmailNorm)
  const r = await pool.request().input('oid', orderId).query<CustomerDisputeRow>(`
    SELECT CAST(d.id AS NVARCHAR(36)) AS disputeId,
      d.status,
      d.reason,
      d.description,
      d.admin_resolution_note,
      d.created_at,
      d.updated_at,
      CAST(d.variant_id AS NVARCHAR(36)) AS variant_id,
      v.sku AS variant_sku,
      p.name AS product_name
    FROM dbo.order_disputes d
    LEFT JOIN dbo.product_variants v ON v.id = d.variant_id
    LEFT JOIN dbo.products p ON p.id = v.product_id
    WHERE d.order_id = @oid
    ORDER BY d.created_at DESC
  `)
  return r.recordset
}

export type AdminDisputeListRow = {
  disputeId: string
  orderId: string
  status: string
  reason: string
  description: string | null
  admin_resolution_note: string | null
  created_at: Date
  updated_at: Date
  order_status: string
  total_cents: number
  currency: string
  customer_email: string | null
  variant_id: string | null
  variant_sku: string | null
  product_name: string | null
}

export async function listDisputesAdmin(pool: ConnectionPool): Promise<AdminDisputeListRow[]> {
  const r = await pool.request().query<AdminDisputeListRow>(`
    SELECT CAST(d.id AS NVARCHAR(36)) AS disputeId,
      CAST(d.order_id AS NVARCHAR(36)) AS orderId,
      d.status,
      d.reason,
      d.description,
      d.admin_resolution_note,
      d.created_at,
      d.updated_at,
      o.status AS order_status,
      o.total_cents,
      o.currency,
      COALESCE(NULLIF(LTRIM(RTRIM(o.guest_email)), ''), NULLIF(LTRIM(RTRIM(u.email)), '')) AS customer_email,
      CAST(d.variant_id AS NVARCHAR(36)) AS variant_id,
      v.sku AS variant_sku,
      p.name AS product_name
    FROM dbo.order_disputes d
    INNER JOIN dbo.orders o ON o.id = d.order_id
    LEFT JOIN dbo.users u ON u.id = o.user_id
    LEFT JOIN dbo.product_variants v ON v.id = d.variant_id
    LEFT JOIN dbo.products p ON p.id = v.product_id
    ORDER BY d.created_at DESC
  `)
  return r.recordset
}

export async function updateDisputeAdmin(
  pool: ConnectionPool,
  disputeId: string,
  patch: { status: string; adminResolutionNote?: string | null },
): Promise<void> {
  const status = parseDisputeStatus(patch.status)
  if (!status) {
    throw new Error('Invalid status')
  }
  const note = patch.adminResolutionNote === undefined ? undefined : patch.adminResolutionNote?.trim() ?? null
  const req = pool.request().input('id', disputeId).input('st', status)
  if (note === undefined) {
    await req.query(`
      UPDATE dbo.order_disputes
      SET status = @st, updated_at = SYSUTCDATETIME()
      WHERE id = @id
    `)
  } else {
    await pool
      .request()
      .input('id', disputeId)
      .input('st', status)
      .input('note', note)
      .query(`
        UPDATE dbo.order_disputes
        SET status = @st, admin_resolution_note = @note, updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `)
  }
}
