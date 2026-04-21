# PayToday Store — Product detail page layout specification

This document describes the **target layout** for the storefront product detail screen, aligned with the **Avo Shop** product-page reference (two-column commerce pattern), using **PayToday Store v2** tokens and **example catalogue copy** for design and QA. Implementation lives in [`frontend/src/pages/store/ProductPage.tsx`](../frontend/src/pages/store/ProductPage.tsx).

---

## 1. Page shell and grid

| Breakpoint | Layout |
|------------|--------|
| **Desktop (md+)** | Two columns: **left** ~58% gallery + tabs + “You might also like”; **right** ~42% buy rail (title, price, actions). Columns align **flex-start**; max content width ~1100px, centred. |
| **Mobile (xs–sm)** | **Single column**, top to bottom: gallery (compact width, centred on narrow phones), buy rail, tabs, related rail. |

**Framing**

- Outer strip uses **`SHOP_V2.pageBackground`** with horizontal bleed and padding consistent with the main shop page.
- Primary surfaces use **`background.paper`**, rounded corners **`SHOP_V2.radius` (`12px`)**, light shadow on the gallery card.

---

## 2. PayToday colour mapping (replaces Avo green with brand tokens)

Source: [`frontend/src/theme/storeV2.ts`](../frontend/src/theme/storeV2.ts) — `SHOP_V2` object (do not replace global MUI theme; scope to store surfaces).

| Role (Avo analogue) | Token / value | Usage |
|----------------------|---------------|--------|
| Primary price, primary CTA fill, active tab indicator, dot pagination (active), related card price | **`SHOP_V2.success`** `#2D915D` | Headline price, full-width “Add to cart” button background, tab underline + selected tab label, gallery dot active state, success alerts / borders where applicable. CTA label and price on button: **white** text. |
| Secondary links (retailer / shop line), optional outlined “visit shop” style, accent chips/links | **`SHOP_V2.accent`** `#5D2D91` | Store name link under title; subtle accent for “View more” on description; outlined secondary actions that should read as brand, not success. |
| Page background | **`SHOP_V2.pageBackground`** `#F4F5F7` | Full-width strip behind the product layout. |
| Corner radius | **`SHOP_V2.radius`** `12px` | Gallery container, primary buttons, related cards, tab panel container. |

**Not used for this page:** Avo’s exact green (`#00A361`); PayToday uses **`#2D915D`** for the same semantic roles (money + commit action).

---

## 3. Left column (detail stack)

### 3.1 Hero gallery

- **Container:** White (paper), **`SHOP_V2.radius`**, subtle elevation, overflow hidden.
- **Main image:** Square aspect hero; on **budget smartphones** the gallery column may use a **max width** (e.g. ~220px) and horizontal centreing so the hero does not dominate the viewport.
- **Multi-image behaviour:**
  - **Previous / next** icon buttons overlaid mid-height left/right (`aria-label` “Previous image” / “Next image”), wrap-around index.
  - **Dot row** under hero, centred; active dot **`SHOP_V2.success`**, inactive neutral grey.
  - **Thumbnail strip** below dots (horizontal scroll); selected thumb **2px outline** in **`SHOP_V2.success`**.
- **Share:** Small circular icon button (e.g. bottom-right when single image, bottom-left when chevrons present to avoid overlap). **`navigator.share`** when available; otherwise **clipboard** + short **Snackbar** confirmation.
- **Promo badges (optional):** Avo shows discount pills on the image; **out of scope** unless product/promo API provides assets and copy. Do not invent “% off” without data.

### 3.2 Tabs (Description, Delivery information, Return policy, …)

- **Chrome:** Flat panel on paper: top border or divider, **no heavy card shadow**.
- **Tabs:** Horizontal, scrollable on small screens; **underline** indicator in **`SHOP_V2.success`**; selected tab text same colour; unselected **text.secondary**.
- **Panels:** Body copy **`text.secondary`**, comfortable line height.

### 3.3 Description tab

- Body: product description (or placeholder).
- **View more / View less:** If description length exceeds a threshold (e.g. ~280 characters), truncate with ellipsis and show a text button toggling expansion (accent-coloured label optional).

### 3.4 “You might also like”

- **Heading:** e.g. “You might also like” + subline “Shop · {store name}”.
- **Rail:** Horizontal scroll of compact **cards** (`RouterLink` to product): image (square), title (max 2 lines), store name (accent), **price in `SHOP_V2.success`**, optional stock caption.
- **Controls:** **Previous / next** circular buttons (dark fill, white chevron) that **`scrollBy`** on the rail container; `aria-label` for scroll left/right.
- **Card sizing:** Slightly narrower cards on xs for uniform strip (e.g. ~152–176px width range).

---

## 4. Right column (buy rail)

Order and content **top to bottom** (Avo-style hierarchy):

1. **Product title** — Large, bold, high contrast (`h1` semantics; responsive font sizes for small phones).
2. **Retailer / shop link** — Under title; **`SHOP_V2.accent`**, navigates to filtered shop or store URL.
3. **Variant options** — Chips and/or **Select** (“Choose option”). **Select display:** must never show raw UUID; use **`renderValue`** showing `{variant name or SKU} — {formatted price}`.
4. **Price row** — Current price prominent in **`SHOP_V2.success`**; optional compare-at **strikethrough** in muted text.
5. **Delivery line** — Single short line, e.g. **“Delivery options shown at checkout.”**
6. **Meta line (caption)** — SKU, stock label, and short reservation note where inventory is tracked (smaller type on xs).
7. **Low stock / out of stock** — Warning or error text as needed.
8. **Quantity** — Small numeric field; compact width on xs.
9. **Primary CTA** — Full-width button: **`SHOP_V2.success`** background, **white** text, **`SHOP_V2.radius`**. **Price left**, **“Add to cart” right** (Avo pattern).
10. **Secondary** — Outlined “View cart” full width below.
11. **Post-add feedback** — Success `Alert`: small thumbnail, “Added to cart”, qty + price, **View cart** + **Continue**; errors in error `Alert`. Live region / `role` for a11y.

**Optional Avo-like blocks (stubs only, no fake bank logos):**

- “Loyalty / rewards deal” row — **Out of scope** until real programme data exists.
- “More ways to pay” — **Out of scope** until payment marketing copy is approved.

---

## 5. Example content block (design / QA)

Use this block to validate spacing, typography, and colours against the spec (not necessarily live API data):

| Field | Example value |
|-------|-----------------|
| Product title | **Budget smartphone** |
| Retailer / shop link | **Pick n Pay** |
| Variant selector | **Choose option** (label); displayed value must be human-readable, e.g. option name + **N$ 3,299.00**, never a bare UUID. |
| Price | **N$ 3,299.00** (display in **`SHOP_V2.success`**) |
| Delivery | **Delivery options shown at checkout.** |
| SKU / stock (caption) | **SKU PHN-BUD-32** · **15 in stock** · *Reserved at checkout; released if the order is cancelled before payment* (wording may be shortened on very small screens for legibility). |
| Quantity | **1** |
| Primary CTA | Green bar: **N$ 3,299.00** (left) + **Add to cart** (right) |
| Secondary | **View cart** (outlined) |

---

## 6. Non-goals and constraints

- **No** Avo-specific assets: Greenbacks logos, bank marks, or proprietary promo artwork unless supplied by product/API.
- **No** invented “% off” badges on the hero without catalogue fields.
- **No** change to cart/checkout APIs from this layout spec; UI-only contract.

---

## 7. Implementation reference

| Area | File |
|------|------|
| Product detail UI | [`frontend/src/pages/store/ProductPage.tsx`](../frontend/src/pages/store/ProductPage.tsx) |
| Store tokens | [`frontend/src/theme/storeV2.ts`](../frontend/src/theme/storeV2.ts) |
| Image fallback / aspect | [`frontend/src/components/store/ProductImage.tsx`](../frontend/src/components/store/ProductImage.tsx) |

When this spec and the implementation diverge, **update this document** or the code so QA has a single source of truth.
