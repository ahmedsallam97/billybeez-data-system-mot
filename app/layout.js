import "./globals.css";
import "@fontsource/tajawal/400.css";
import "@fontsource/tajawal/500.css";
import "@fontsource/tajawal/700.css";
import "@fontsource/tajawal/800.css";
import ToastProvider from "./ToastProvider";
import { UiPreferencesProvider } from "./i18n";

export const metadata = {
  applicationName: "BillyBeez Data System",
  title: {
    default: "BillyBeez Data System",
    template: "%s | BillyBeez Data System",
  },
  description: "BillyBeez private data, restaurant, cashier, and manager interface system.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
  formatDetection: {
    telephone: false,
    date: false,
    address: false,
    email: false,
  },
  icons: {
    icon: [{ url: "/billy-favicon.png", type: "image/png" }],
    shortcut: "/billy-favicon.png",
    apple: "/billy-favicon.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#301848",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <UiPreferencesProvider>
          <ToastProvider>{children}</ToastProvider>
        </UiPreferencesProvider>
      </body>
    </html>
  );
}
