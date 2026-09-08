# BN-Pagos

Gestión de pagos masivos y generador del archivo de importación posicional del **Banco Nacional de Costa Rica (BNCR)**.

- Catálogo maestro de empleados y proveedores (cédula, nombre, cuenta cliente de 17 dígitos).
- Pago de planilla: varios rubros por empleado (salario base, lavado de carro, descarga de maíz…) que se suman en un solo depósito.
- Pago de proveedores: varias facturas por proveedor, manuales o extraídas de XML de Hacienda / PDF.
- Historial: cada lote exportado queda en Supabase con su archivo, para reconsultarlo o volver a descargarlo.

## Stack

Next.js (App Router) + TypeScript + TailwindCSS, Supabase (PostgreSQL) y despliegue en Vercel.

## Puesta en marcha

1. `npm install`
2. Copiar `.env.example` a `.env.local` y completar las variables.
3. Ejecutar `supabase/migrations/0001_bncr_pagos_masivos.sql` en el SQL Editor de la instancia de Supabase existente. Solo crea tablas nuevas con prefijo `bncr_`; no toca las tablas actuales.
4. `npm run dev`

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run lint` | ESLint |
| `npm test` | Pruebas del motor de formato BNCR |

## Formato del archivo BNCR

El motor vive en `src/lib/bncr/formato.ts`. Las posiciones están declaradas en las tablas `LAYOUT_TIPO_1..4`; si el banco cambia un ancho se ajusta ahí y todo el archivo se recalcula.

| Tipo | Contenido |
| --- | --- |
| `1` | Encabezado global: cédula y nombre de la empresa, fecha de aplicación, moneda, consecutivo y descripción del lote |
| `2` | Cuenta débito de origen (17 dígitos), monto total en céntimos a 12 posiciones y cantidad de detalles |
| `3` | Un registro por beneficiario: cuenta cliente de 17 dígitos, cédula, nombre, monto en céntimos y concepto de 30 caracteres |
| `4` | Cierre: cantidad de detalles, monto total y checksum |

Reglas aplicadas: montos siempre en céntimos (monto × 100, sin decimales, rellenos con ceros a la izquierda); texto en MAYÚSCULAS sin tildes, relleno con espacios a la derecha; cuenta cliente de 17 dígitos (si se digita el IBAN de 22 se convierte automáticamente); líneas separadas con CRLF.

> Los anchos y el checksum se implementaron según las reglas de dominio entregadas. Antes de usarlo en producción conviene validarlos contra la especificación oficial vigente del BNCR y hacer una carga de prueba en el Internet Banking.

## Estructura

```
src/
  app/
    page.tsx                      UI principal (planilla, proveedores, catálogos, historial)
    api/beneficiarios/[tipo]/     CRUD del catálogo e historial por beneficiario
    api/lotes/                    Generación, consulta y descarga de lotes
    api/facturas/extraer/         Extracción de facturas XML/PDF
  components/                     Generador de lotes, catálogo, historial y UI compartida
  lib/
    bncr/formato.ts               Motor posicional de ancho fijo
    beneficiarios.ts, lotes.ts    Capa de datos sobre Supabase
    facturaXml.ts, gemini.ts      Extracción de facturas
supabase/migrations/              Script SQL con las tablas bncr_
```
