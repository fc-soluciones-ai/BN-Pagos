import type { MonedaBncr } from "@/lib/bncr/formato";

export type TipoBeneficiario = "empleado" | "proveedor";

/** Un lote de planilla paga empleados; uno de proveedores paga facturas. */
export type TipoLote = "planilla" | "proveedores";

/** Columna de aislamiento que lleva toda tabla de la base centralizada del portal. */
export interface CamposTenant {
  inquilino_id: string;
}

export interface Beneficiario extends CamposTenant {
  id: string;
  cedula: string;
  nombre: string;
  /** Banco destino; se traduce al código de 3 dígitos del archivo. */
  banco: string;
  /** IBAN de referencia: no viaja en el archivo del banco. */
  cuenta_iban: string | null;
  activo: boolean;
  created_at: string;
  /** Solo empleados: colaborador correspondiente en `planillas_empleados`. */
  planilla_empleado_id?: string | null;
  /** Solo empleados. */
  puesto?: string | null;
  /** Solo proveedores. */
  correo?: string | null;
}

export interface RubroPago {
  id: string;
  detalle_id: string;
  descripcion: string;
  numero_factura: string | null;
  monto_centimos: number;
}

/**
 * Fila de `public.sistema_pagos_bncr`: el depósito acumulado de un
 * beneficiario dentro de un lote. `nombre_empleado` y `empleado_id` conservan
 * el nombre del DDL del portal aunque la fila sea de un proveedor.
 */
export interface DetallePago extends CamposTenant {
  id: string;
  lote_id: string;
  beneficiario_tipo: TipoBeneficiario;
  beneficiario_id: string | null;
  /** FK a `planillas_empleados(id)`; null en proveedores. */
  empleado_id: string | null;
  nombre_empleado: string;
  cedula: string;
  banco: string;
  cuenta_iban: string;
  concepto: string;
  /** Monto con decimales (numeric en la base), ya acumulado. */
  monto_pagar: number;
  moneda: MonedaBncr;
  estado: string;
  periodo_planilla: string | null;
  observacion: string | null;
  linea: number;
  created_at: string;
  bncr_rubros_pago?: RubroPago[];
}

export interface Lote extends CamposTenant {
  id: string;
  consecutivo: number;
  tipo: TipoLote;
  descripcion: string;
  /** Código de cliente/convenio de la empresa ante el BNCR (6 dígitos). */
  numero_cliente: string;
  /** Cuenta patronal del BNCR de la que se debita el total (9 dígitos). */
  cuenta_origen: string;
  nombre_empresa: string;
  moneda: MonedaBncr;
  fecha_aplicacion: string;
  total_centimos: number;
  cantidad_detalles: number;
  nombre_archivo: string;
  contenido: string;
  created_at: string;
}

export interface LoteConDetalles extends Lote {
  sistema_pagos_bncr: DetallePago[];
}

/** Datos que se extraen de una factura de proveedor (XML de Hacienda o PDF vía Gemini). */
export interface FacturaExtraidaCliente {
  numeroFactura: string | null;
  cedulaProveedor: string | null;
  nombreProveedor: string | null;
  /** Fecha de emisión en formato yyyy-mm-dd. */
  fechaEmision: string | null;
  /** Total del comprobante con decimales. */
  total: number | null;
  moneda: string | null;
}

/** Una línea del historial de pagos de un beneficiario. */
export interface MovimientoHistorial extends DetallePago {
  bncr_lotes: Pick<
    Lote,
    "id" | "consecutivo" | "tipo" | "descripcion" | "fecha_aplicacion" | "moneda" | "nombre_archivo"
  > | null;
}
