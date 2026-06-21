# BillyBeez Data System MOT

## Next.js Version

The new version is a Next.js app with Prisma. The old Google Apps Script files are still kept in the repo while the migration is completed.

### Run Locally

```bash
npm install
npx prisma db push
npm run db:seed
npm run dev
```

Open `http://localhost:3000`.

To import the current Google Apps Script data into the local Prisma database:

```bash
npm run db:import:apps-script
```

The importer reads the Apps Script URL from `config.js` and upserts products, employees, orders, and order items.

Seed users:

| Role | Username | Password |
| ---- | -------- | -------- |
| Manager | manager | manager123 |
| Cashier | cashier | cashier123 |
| Kitchen | kitchen | kitchen123 |
| Admin | admin | admin123 |

The local dev database uses SQLite from `DATABASE_URL` in `.env`. For production, switch `DATABASE_URL` to PostgreSQL and run the same Prisma setup commands.

Simple cashier, delivery, invoice, and manager dashboard system backed by Google Sheets and Google Apps Script.

## Files

- `index.html`: login page
- `cashier.html`: create orders
- `delivery.html`: mark orders as delivered or paid
- `invoice.html`: printable invoice
- `dashboard.html`: manager dashboard
- `orders.html`: order history and invoice reprint
- `config.js`: Google Apps Script Web App URL
- `code.gs`: Apps Script backend

## Google Sheet Setup

Create a Google Sheet with these tabs and columns.

### Users

| id  | name | username | password | role |
| --- | ---- | -------- | -------- | ---- |

Supported roles are `Manager`, `Cashier`, and `Delivery`. `Admin` is also treated like a manager.

### Products

| productId | categoryId | productName | price | imageUrl | categoryName |
| --------- | ---------- | ----------- | ----- | -------- | ------------ |

### Orders

| orderId | braceletNo | childName | cashierName | time | status | total |
| ------- | ---------- | --------- | ----------- | ---- | ------ | ----- |

### OrderItems

| itemId | orderId | productId | productName | qty | price | total |
| ------ | ------- | --------- | ----------- | --- | ----- | ----- |

### الموظفين

| employeeId | employeeName | active |
| ---------- | ------------ | ------ |

## Apps Script Setup

1. Open the Google Sheet.
2. Go to `Extensions` > `Apps Script`.
3. Paste the contents of `code.gs`.
4. Confirm `SHEET_ID` matches your Google Sheet ID.
5. Run `setupSheets()` once from Apps Script to create missing tabs and headers.
6. Deploy as a Web App:
   - Execute as: `Me`
   - Who has access: `Anyone`
7. Copy the Web App URL.
8. Paste it into `config.js` as `API_URL`.

## Main Flow

1. Login from `index.html`.
2. Create an order from `cashier.html`.
3. Mark it delivered or paid from `delivery.html`.
4. When paid, `invoice.html` opens for printing.
5. Review totals from `dashboard.html`.
6. Search old orders and reprint invoices from `orders.html`.

## Notes

- `BB Logo.png` is referenced by `index.html`; add this image to the repo if the logo should appear.
- Passwords are currently stored in plain text in the `Users` sheet. For production, add stronger authentication or at least a shared API token.
- Anyone with the Apps Script URL can call the API if the Web App is public.
