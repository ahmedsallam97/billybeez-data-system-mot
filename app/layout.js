import "./globals.css";

export const metadata = {
  title: "BillyBeez Data System",
  description: "BillyBeez cashier, kitchen, and manager system",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
