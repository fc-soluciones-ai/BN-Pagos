import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "BN Pagos — Pagos masivos BNCR",
  description:
    "Generador de archivos de importación de pagos masivos (planilla y proveedores) para el Banco Nacional de Costa Rica.",
  applicationName: "BN Pagos",
};

export const viewport: Viewport = {
  themeColor: "#dc2626",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="min-h-screen">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-4">
            <p className="text-lg font-bold uppercase tracking-wide text-red-700">BN Pagos</p>
            <p className="text-sm text-slate-500">
              Pagos masivos BNCR — planilla, proveedores y archivo de importación
            </p>
          </div>
        </header>
        <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
