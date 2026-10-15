import "./globals.css";
import "./ui-fixes.css";
import "./themes.css";
import "./desktop-layout.css";
import { preferenceBootstrap } from "@/lib/ui-preferences";
import "@fontsource/tajawal/400.css";
import "@fontsource/tajawal/500.css";
import "@fontsource/tajawal/700.css";
import "@fontsource/tajawal/800.css";
import ToastProvider from "./ToastProvider";
import { UiPreferencesProvider } from "./i18n";
import PilotBanner from "./PilotBanner";

export const metadata = {
  title: "BillyBeez POS & Data System",
  description: "BillyBeez POS, data, restaurant, and manager interface system",
  icons: {
    icon: [{ url: "/billy-favicon.png", type: "image/png" }],
    shortcut: "/billy-favicon.png",
    apple: "/billy-favicon.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: preferenceBootstrap }} />
        <link rel="preload" as="image" href="/bb-logo-fast.png" fetchPriority="high" />
      </head>
      <body suppressHydrationWarning>
        <PilotBanner />
        <UiPreferencesProvider>
          <ToastProvider>{children}</ToastProvider>
        </UiPreferencesProvider>
      </body>
    </html>
  );
}
