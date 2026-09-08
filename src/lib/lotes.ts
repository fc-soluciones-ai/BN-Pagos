import "server-only";

import {
  aCentimos,
  construirArchivoBncr,
  nombreArchivoLote,
  normalizarTexto,
  type DetalleBncr,
  type ExtensionArchivo,
  type MonedaBncr,
} from "@/lib/bncr/formato";
import { manejarErrorSupabase } from "@/lib/supabase/server";
import { sesion } from "@/lib/tenant";
import type {
  Beneficiario,
  Lote,
  LoteConDetalles,
  MovimientoHistorial,
  TipoBeneficiario,
  TipoLote,
} from "@/lib/tipos";

const TABLA_BENEFICIARIO: Record<TipoBeneficiario, string> = {
  empleado: "bncr_empleados",
  proveedor: "bncr_proveedores",
};

const SELECT_LOTE_CON_DETALLES = "*, sistema_pagos_bncr(*, bncr_rubros_pago(*))";

export interface EntradaRubro {
  descripcion: string;
  numero_factura?: string | null;
  /** Monto en colones/dólares con decimales, tal como se digita en la UI. */
  monto: number;
}

export interface EntradaDetalle {
  beneficiario_id: string;
  concepto?: string;
  rubros: EntradaRubro[];
}

export interface EntradaLote {
  tipo: TipoLote;
  descripcion: string;
  numero_cliente: string;
  cuenta_origen: string;
  nombre_empresa: string;
  moneda: MonedaBncr;
  fecha_aplicacion: string;
  extension: ExtensionArchivo;
  detalles: EntradaDetalle[];
}

const TIPO_BENEFICIARIO: Record<TipoLote, TipoBeneficiario> = {
  planilla: "empleado",
  proveedores: "proveedor",
};

/** Concepto por defecto: los rubros de planilla o los números de factura. */
function conceptoAutomatico(tipo: TipoLote, rubros: EntradaRubro[]): string {
  if (tipo === "proveedores") {
    const facturas = rubros.map((rubro) => rubro.numero_factura).filter(Boolean);
    if (facturas.length > 0) return `FACT ${facturas.join(" ")}`;
  }
  return rubros.map((rubro) => rubro.descripcion).join(" + ");
}

export interface LoteGenerado {
  lote: Lote;
  contenido: string;
}

/**
 * Genera el archivo del BNCR y lo guarda como lote, con un detalle por
 * beneficiario (suma de sus rubros) y el desglose que lo compone.
 *
 * El consecutivo lo asigna la secuencia de Postgres, así que la fila se inserta
 * primero y el contenido se escribe después, ya con ese número en el
 * encabezado tipo 1.
 */
export async function crearLote(entrada: EntradaLote): Promise<LoteGenerado> {
  if (entrada.detalles.length === 0) {
    throw new Error("Agrega al menos un beneficiario antes de generar el archivo.");
  }

  const { supabase, tenant } = await sesion();
  const tipoBeneficiario = TIPO_BENEFICIARIO[entrada.tipo];

  const { data: filasCatalogo, error: errorCatalogo } = await supabase
    .from(TABLA_BENEFICIARIO[tipoBeneficiario])
    .select("*")
    .eq("inquilino_id", tenant.inquilinoId)
    .in(
      "id",
      entrada.detalles.map((detalle) => detalle.beneficiario_id),
    );
  if (errorCatalogo) manejarErrorSupabase(errorCatalogo);
  const catalogo = new Map((filasCatalogo as Beneficiario[]).map((fila) => [fila.id, fila]));

  const preparados = entrada.detalles.map((detalle) => {
    const beneficiario = catalogo.get(detalle.beneficiario_id);
    if (!beneficiario) {
      throw new Error("Uno de los beneficiarios ya no existe en el catálogo. Recarga la página.");
    }

    const rubros = detalle.rubros.filter((rubro) => Number(rubro.monto) > 0);
    if (rubros.length === 0) {
      throw new Error(`${beneficiario.nombre} no tiene rubros con monto mayor a cero.`);
    }

    const montoCentimos = rubros.reduce((total, rubro) => total + aCentimos(Number(rubro.monto)), 0);
    const concepto = normalizarTexto(
      detalle.concepto?.trim() || conceptoAutomatico(entrada.tipo, rubros),
    );

    return { beneficiario, rubros, montoCentimos, concepto };
  });

  const detallesBncr: DetalleBncr[] = preparados.map((detalle) => ({
    cedula: detalle.beneficiario.cedula,
    nombre: detalle.beneficiario.nombre,
    banco: detalle.beneficiario.banco,
    concepto: detalle.concepto,
    montoCentimos: detalle.montoCentimos,
  }));

  const { data: filaLote, error: errorLote } = await supabase
    .from("bncr_lotes")
    .insert({
      inquilino_id: tenant.inquilinoId,
      tipo: entrada.tipo,
      descripcion: entrada.descripcion.trim(),
      numero_cliente: entrada.numero_cliente,
      cuenta_origen: entrada.cuenta_origen,
      nombre_empresa: entrada.nombre_empresa,
      moneda: entrada.moneda,
      fecha_aplicacion: entrada.fecha_aplicacion,
      total_centimos: detallesBncr.reduce((total, detalle) => total + detalle.montoCentimos, 0),
      cantidad_detalles: detallesBncr.length,
      nombre_archivo: "",
      contenido: "",
      creado_por: tenant.email,
    })
    .select("*")
    .single();

  if (errorLote) manejarErrorSupabase(errorLote);
  const lote = filaLote as Lote;

  try {
    const archivo = construirArchivoBncr({
      numeroCliente: entrada.numero_cliente,
      cuentaOrigen: entrada.cuenta_origen,
      fechaAplicacion: entrada.fecha_aplicacion,
      descripcion: entrada.descripcion,
      detalles: detallesBncr,
    });

    const nombreArchivo = nombreArchivoLote(
      entrada.tipo,
      lote.consecutivo,
      entrada.fecha_aplicacion,
      entrada.extension,
    );

    const { data: detallesInsertados, error: errorDetalles } = await supabase
      .from("sistema_pagos_bncr")
      .insert(
        preparados.map((detalle, indice) => ({
          inquilino_id: tenant.inquilinoId,
          lote_id: lote.id,
          beneficiario_tipo: tipoBeneficiario,
          beneficiario_id: detalle.beneficiario.id,
          // empleado_id apunta a planillas_empleados, no al catálogo local.
          empleado_id: detalle.beneficiario.planilla_empleado_id ?? null,
          nombre_empleado: detalle.beneficiario.nombre.slice(0, 40),
          cedula: detalle.beneficiario.cedula,
          banco: detalle.beneficiario.banco,
          cuenta_iban: detalle.beneficiario.cuenta_iban ?? "",
          concepto: detalle.concepto,
          monto_pagar: detalle.montoCentimos / 100,
          moneda: entrada.moneda,
          estado: "exportado",
          periodo_planilla: entrada.descripcion.trim().slice(0, 50),
          observacion: detalle.concepto.slice(0, 255),
          linea: indice + 1,
        })),
      )
      .select("id, linea");

    if (errorDetalles) manejarErrorSupabase(errorDetalles);

    const idPorLinea = new Map(
      (detallesInsertados as { id: string; linea: number }[]).map((fila) => [fila.linea, fila.id]),
    );

    const rubros = preparados.flatMap((detalle, indice) =>
      detalle.rubros.map((rubro) => ({
        inquilino_id: tenant.inquilinoId,
        detalle_id: idPorLinea.get(indice + 1)!,
        descripcion: rubro.descripcion.trim() || "PAGO",
        numero_factura: rubro.numero_factura?.trim() || null,
        monto_centimos: aCentimos(Number(rubro.monto)),
      })),
    );

    const { error: errorRubros } = await supabase.from("bncr_rubros_pago").insert(rubros);
    if (errorRubros) manejarErrorSupabase(errorRubros);

    const { data: filaFinal, error: errorFinal } = await supabase
      .from("bncr_lotes")
      .update({ nombre_archivo: nombreArchivo, contenido: archivo.contenido })
      .eq("id", lote.id)
      .eq("inquilino_id", tenant.inquilinoId)
      .select("*")
      .single();

    if (errorFinal) manejarErrorSupabase(errorFinal);
    return { lote: filaFinal as Lote, contenido: archivo.contenido };
  } catch (error) {
    // Sin el archivo el lote no sirve para nada: se borra para no dejar
    // consecutivos huérfanos en el historial (los detalles caen en cascada).
    await supabase
      .from("bncr_lotes")
      .delete()
      .eq("id", lote.id)
      .eq("inquilino_id", tenant.inquilinoId);
    throw error;
  }
}

export async function listarLotes(tipo?: TipoLote): Promise<Lote[]> {
  const { supabase, tenant } = await sesion();
  let consulta = supabase
    .from("bncr_lotes")
    .select("*")
    .eq("inquilino_id", tenant.inquilinoId)
    .order("created_at", { ascending: false });
  if (tipo) consulta = consulta.eq("tipo", tipo);

  const { data, error } = await consulta;
  if (error) manejarErrorSupabase(error);
  return (data ?? []) as Lote[];
}

export async function obtenerLote(id: string): Promise<LoteConDetalles> {
  const { supabase, tenant } = await sesion();
  const { data, error } = await supabase
    .from("bncr_lotes")
    .select(SELECT_LOTE_CON_DETALLES)
    .eq("id", id)
    .eq("inquilino_id", tenant.inquilinoId)
    .single();

  if (error) manejarErrorSupabase(error);
  return data as unknown as LoteConDetalles;
}

/** Todos los pagos hechos a un empleado o proveedor, del más reciente al más viejo. */
export async function historialBeneficiario(
  tipo: TipoBeneficiario,
  beneficiarioId: string,
): Promise<MovimientoHistorial[]> {
  const { supabase, tenant } = await sesion();

  const { data, error } = await supabase
    .from("sistema_pagos_bncr")
    .select(
      "*, bncr_rubros_pago(*), bncr_lotes(id, consecutivo, tipo, descripcion, fecha_aplicacion, moneda, nombre_archivo)",
    )
    .eq("beneficiario_tipo", tipo)
    .eq("beneficiario_id", beneficiarioId)
    .eq("inquilino_id", tenant.inquilinoId)
    .order("created_at", { ascending: false });

  if (error) manejarErrorSupabase(error);
  return (data ?? []) as unknown as MovimientoHistorial[];
}
