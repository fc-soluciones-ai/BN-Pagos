import type { MonedaBncr } from "@/lib/bncr/formato";

export type TipoBeneficiario = "empleado" | "proveedor";

/** Un lote de planilla paga empleados; uno de proveedores paga facturas. */
export type TipoLote = "planilla" | "proveedores";

export interface Beneficiario {
  id: string;
  cedula: string;
  nombre: string;
  cuenta_cliente: string;
  activo: boolean;
  created_at: string;
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

export interface DetallePago {
  id: string;
  lote_id: string;
  beneficiario_tipo: TipoBeneficiario;
  empleado_id: string | null;
  proveedor_id: string | null;
  nombre_beneficiario: string;
  cedula: string;
  cuenta_cliente: string;
  concepto: string;
  monto_centimos: number;
  linea: number;
  bncr_rubros_pago?: RubroPago[];
}

export interface Lote {
  id: string;
  consecutivo: number;
  tipo: TipoLote;
  descripcion: string;
  cuenta_debito: string;
  cedula_empresa: string;
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
  bncr_detalles_pago: DetallePago[];
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
  bncr_lotes: Pick<Lote, "id" | "consecutivo" | "tipo" | "descripcion" | "fecha_aplicacion" | "moneda" | "nombre_archivo"> | null;
}
