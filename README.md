# BN-Pagos

Gestión de pagos masivos y generador del archivo de importación posicional del **Banco Nacional de Costa Rica (BNCR)**. Es una herramienta hija del **FC Enterprise Portal**: comparte su base de Supabase, su sesión y su modelo de inquilinos.

- Catálogo maestro de empleados y proveedores (cédula, banco destino, IBAN de referencia).
- Pago de planilla: varios rubros por empleado (salario base, lavado de carro, descarga de maíz…) que se suman en un solo depósito.
- Pago de proveedores: varias facturas por proveedor, manuales o extraídas de XML de Hacienda / PDF.
- Historial: cada lote exportado queda en Supabase con su archivo, para reconsultarlo o volver a descargarlo.

## Stack

Next.js (App Router) + TypeScript + TailwindCSS, Supabase (PostgreSQL) y despliegue en Vercel.

## Puesta en marcha

1. `npm install`
2. Copiar `.env.example` a `.env.local` y completar las variables (las mismas `NEXT_PUBLIC_SUPABASE_*` del portal).
3. Ejecutar `supabase/migrations/0001_bncr_pagos_masivos.sql` en el SQL Editor de la base centralizada del portal. Solo agrega tablas nuevas (`sistema_pagos_bncr` y las `bncr_`) en el esquema `public`; no toca las tablas actuales.
4. `npm run dev`

## Sesión e inquilino

La app **no tiene login propio**. El portal madre redirige a `/auth/callback` con `access_token`, `refresh_token`, `tenant_id` y `next` en el **fragmento** (`#`) de la URL — nunca en el query string, para que los tokens no viajen al servidor ni queden en logs. Esa página los toma con `supabase.auth.setSession()`, fija la empresa activa si el usuario es superadmin y redirige a `next`.

`src/middleware.ts` refresca la sesión en cada request y manda al login del portal (`NEXT_PUBLIC_PORTAL_URL`) a quien no la tenga.

El inquilino **no** sale de variables de entorno: se resuelve como en el resto del portal, desde `public.profiles` (`inquilino_id`, o `active_inquilino_id` si es superadmin) en `src/lib/tenant.ts`. Toda consulta usa el cliente de Supabase con la llave anónima y la sesión del usuario, así que pasa por RLS; el filtro `.eq('inquilino_id', …)` de la capa de datos es una segunda malla, no el mecanismo principal.

## Multi-tenant

Todo corre sobre la **misma base de datos** del portal. Cada tabla lleva `inquilino_id uuid not null default current_inquilino_id()`, RLS habilitado y la política estándar:

```sql
using (inquilino_id = current_inquilino_id())
with check (inquilino_id = current_inquilino_id())
```

No hay `empresa_id`: esa columna no existe en el portal, donde el aislamiento es `inquilino_id → inquilinos(id)`.

| Tabla | Para qué |
| --- | --- |
| `sistema_pagos_bncr` | Detalle de pagos: una fila por beneficiario y lote, con `empleado_id → planillas_empleados(id)` |
| `bncr_empleados`, `bncr_proveedores` | Catálogo de beneficiarios de este módulo |
| `bncr_lotes` | Archivo generado, su consecutivo y su contenido |
| `bncr_rubros_pago` | Desglose 1:N (rubros de planilla o facturas) de cada fila de `sistema_pagos_bncr` |

Los empleados del catálogo se enlazan al colaborador de la app de Planillas con `planilla_empleado_id → planillas_empleados(id)`; la FK se crea solo si esa tabla ya existe en la base.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run lint` | ESLint |
| `npm test` | Pruebas del motor de formato BNCR |

## Formato del archivo BNCR

El motor vive en `src/lib/bncr/formato.ts` y replica el layout **reconstruido byte a byte contra un archivo real** ya procesado por BN Internet Corporativo (el mismo que usa la app de Planillas del portal): **68 caracteres por línea**, CRLF, y beneficiario identificado por **código de banco + cédula de 9 dígitos** — no hay cuenta cliente de 17 dígitos ni campo de moneda.

| Tipo | Contenido |
| --- | --- |
| `1` | Encabezado: número de cliente/convenio (6) + fecha `ddmmyyyy` + relleno |
| `2` | Débito de la cuenta patronal: banco `056` + cuenta origen (9) + secuencia + total en céntimos (12) + concepto (30) |
| `3` | Un crédito por beneficiario: banco (3) + cédula (9) + secuencia + monto en céntimos (12) + concepto (30) |
| `4` | Cierre: cantidad de créditos y monto total |

Reglas aplicadas: montos siempre en céntimos (monto × 100, sin decimales, rellenos con ceros a la izquierda); conceptos en MAYÚSCULAS sin tildes a exactamente 30 caracteres; líneas separadas con CRLF y salto final.

> **Sin confirmar:** en el archivo real la línea tipo 4 trae además una cadena alfanumérica de 10 caracteres que no se pudo descifrar con una sola muestra; acá va en ceros. Antes de un envío grande conviene hacer una carga de prueba con un monto pequeño en el Internet Banking. El código de banco de un beneficiario que no esté en la tabla conocida hace fallar la exportación a propósito: un código equivocado deposita en otra entidad.

## Estructura

```
src/
  middleware.ts                   Refresco de sesión y redirección al portal
  app/
    page.tsx                      UI principal (planilla, proveedores, catálogos, historial)
    auth/callback/                Handoff de sesión desde el portal madre
    api/beneficiarios/[tipo]/     CRUD del catálogo e historial por beneficiario
    api/lotes/                    Generación, consulta y descarga de lotes
    api/planilla/colaboradores/   Colaboradores de planillas_empleados para enlazar
    api/facturas/extraer/         Extracción de facturas XML/PDF
  components/                     Generador de lotes, catálogo, historial y UI compartida
  lib/
    bncr/formato.ts               Motor posicional de 68 caracteres
    tenant.ts                     Sesión e inquilino activo desde profiles
    supabase/                     Clientes SSR (servidor y navegador)
    beneficiarios.ts, lotes.ts    Capa de datos sobre Supabase
    facturaXml.ts, gemini.ts      Extracción de facturas
supabase/migrations/              Script SQL de las tablas del módulo
```
