import "./globals.css";
import ToastProvider from "./ToastProvider";

export const metadata = {
  title: "BillyBeez Data System",
  description: "BillyBeez cashier, kitchen, and manager system",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body><ToastProvider>{children}</ToastProvider></body>
    </html>
  );
}
