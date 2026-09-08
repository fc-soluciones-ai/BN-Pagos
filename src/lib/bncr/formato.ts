/**
 * Motor de generación del archivo posicional de ancho fijo del Banco Nacional
 * de Costa Rica (BNCR) para pagos masivos / débito a cuenta.
 *
 * El archivo tiene cuatro tipos de registro, uno por línea:
 *
 *   1 → Encabezado global (empresa, fecha, moneda, consecutivo del lote).
 *   2 → Cuenta débito de origen (de dónde sale la plata) y totales del lote.
 *   3 → Un registro por beneficiario con el depósito acumulado.
 *   4 → Cierre con la cantidad de detalles, el total y el checksum.
 *
 * Todos los montos viajan en céntimos (monto × 100, sin separadores ni punto
 * decimal) rellenos con ceros a la izquierda, y todo el texto va en MAYÚSCULAS
 * sin tildes ni caracteres especiales, relleno con espacios a la derecha.
 *
 * Las posiciones viven en las tablas `LAYOUT_TIPO_*` de abajo: si el banco
 * publica un ajuste de anchos, se cambia ahí y todo el archivo se recalcula.
 */

export type MonedaBncr = "CRC" | "USD";

/** Código numérico de moneda que usa el archivo del BNCR (1 colones, 2 dólares). */
const CODIGO_MONEDA: Record<MonedaBncr, string> = { CRC: "1", USD: "2" };

export const LARGO_CUENTA_CLIENTE = 17;
export const LARGO_IBAN_CR = 22;

export type TipoCampo = "alfa" | "num";

export interface CampoPosicional {
  nombre: string;
  ancho: number;
  tipo: TipoCampo;
}

/** Tipo 1 — Encabezado global (una sola línea, siempre la primera). */
export const LAYOUT_TIPO_1: CampoPosicional[] = [
  { nombre: "tipoRegistro", ancho: 1, tipo: "num" },
  { nombre: "cedulaEmpresa", ancho: 12, tipo: "num" },
  { nombre: "nombreEmpresa", ancho: 40, tipo: "alfa" },
  { nombre: "fechaAplicacion", ancho: 8, tipo: "num" },
  { nombre: "moneda", ancho: 1, tipo: "num" },
  { nombre: "consecutivoLote", ancho: 6, tipo: "num" },
  { nombre: "descripcionLote", ancho: 30, tipo: "alfa" },
];

/** Tipo 2 — Cuenta débito de origen con el monto total del lote. */
export const LAYOUT_TIPO_2: CampoPosicional[] = [
  { nombre: "tipoRegistro", ancho: 1, tipo: "num" },
  { nombre: "cuentaDebito", ancho: 17, tipo: "num" },
  { nombre: "montoTotal", ancho: 12, tipo: "num" },
  { nombre: "cantidadDetalles", ancho: 6, tipo: "num" },
  { nombre: "moneda", ancho: 1, tipo: "num" },
  { nombre: "descripcionLote", ancho: 30, tipo: "alfa" },
];

/** Tipo 3 — Un registro por beneficiario (depósito acumulado de sus rubros). */
export const LAYOUT_TIPO_3: CampoPosicional[] = [
  { nombre: "tipoRegistro", ancho: 1, tipo: "num" },
  { nombre: "consecutivoLinea", ancho: 6, tipo: "num" },
  { nombre: "cuentaCliente", ancho: 17, tipo: "num" },
  { nombre: "cedulaBeneficiario", ancho: 12, tipo: "alfa" },
  { nombre: "nombreBeneficiario", ancho: 40, tipo: "alfa" },
  { nombre: "monto", ancho: 12, tipo: "num" },
  { nombre: "moneda", ancho: 1, tipo: "num" },
  { nombre: "concepto", ancho: 30, tipo: "alfa" },
];

/** Tipo 4 — Cierre con checksum de control. */
export const LAYOUT_TIPO_4: CampoPosicional[] = [
  { nombre: "tipoRegistro", ancho: 1, tipo: "num" },
  { nombre: "cantidadDetalles", ancho: 6, tipo: "num" },
  { nombre: "montoTotal", ancho: 12, tipo: "num" },
  { nombre: "checksum", ancho: 12, tipo: "num" },
];

export interface DetalleBncr {
  /** Cuenta cliente del beneficiario: 17 dígitos, nunca el IBAN de 22. */
  cuentaCliente: string;
  cedula: string;
  nombre: string;
  concepto: string;
  /** Monto en céntimos (colones × 100), ya acumulado de todos sus rubros. */
  montoCentimos: number;
}

export interface LoteBncr {
  cedulaEmpresa: string;
  nombreEmpresa: string;
  /** Cuenta cliente (17 dígitos) de la que el banco debita el total. */
  cuentaDebito: string;
  moneda: MonedaBncr;
  /** Fecha de aplicación en formato yyyy-mm-dd (la del `<input type="date">`). */
  fechaAplicacion: string;
  consecutivo: number;
  descripcion: string;
  detalles: DetalleBncr[];
}

export interface ArchivoBncr {
  contenido: string;
  lineas: string[];
  totalCentimos: number;
  cantidadDetalles: number;
}

/** Error de validación con un mensaje ya listo para mostrarle al usuario. */
export class ErrorFormatoBncr extends Error {}

export function soloDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

/** MAYÚSCULAS sin tildes ni caracteres que el banco no acepta. */
export function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ºª]/g, "")
    .toUpperCase()
    .replace(/Ñ/g, "N")
    .replace(/[^A-Z0-9 .,\-/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function campoAlfa(valor: string, ancho: number): string {
  return normalizarTexto(valor).slice(0, ancho).padEnd(ancho, " ");
}

function campoNumerico(valor: string | number, ancho: number, campo: string): string {
  const digitos = typeof valor === "number" ? String(Math.trunc(valor)) : soloDigitos(valor);
  if (digitos.length > ancho) {
    throw new ErrorFormatoBncr(
      `El campo "${campo}" no cabe en ${ancho} dígitos (valor: ${digitos}).`,
    );
  }
  return digitos.padStart(ancho, "0");
}

function construirLinea(layout: CampoPosicional[], valores: Record<string, string | number>): string {
  return layout
    .map((campo) => {
      const valor = valores[campo.nombre];
      if (valor === undefined) {
        throw new ErrorFormatoBncr(`Falta el valor del campo "${campo.nombre}".`);
      }
      return campo.tipo === "num"
        ? campoNumerico(valor, campo.ancho, campo.nombre)
        : campoAlfa(String(valor), campo.ancho);
    })
    .join("");
}

/** Largo total de una línea según su layout, útil para verificar el archivo. */
export function largoLinea(layout: CampoPosicional[]): number {
  return layout.reduce((total, campo) => total + campo.ancho, 0);
}

/** Convierte colones (con decimales) a céntimos enteros, que es lo que exige el banco. */
export function aCentimos(monto: number): number {
  return Math.round(monto * 100);
}

export function formatearMonto(centimos: number, moneda: MonedaBncr = "CRC"): string {
  return new Intl.NumberFormat("es-CR", { style: "currency", currency: moneda }).format(
    centimos / 100,
  );
}

/** true si la cuenta tiene exactamente los 17 dígitos de la cuenta cliente. */
export function esCuentaClienteValida(cuenta: string): boolean {
  return new RegExp(`^\\d{${LARGO_CUENTA_CLIENTE}}$`).test(soloDigitos(cuenta));
}

/**
 * Acepta cuenta cliente (17 dígitos) o IBAN de Costa Rica (22 caracteres) y
 * devuelve siempre la cuenta cliente: el IBAN es `CR` + 2 dígitos de control +
 * un 0 + los mismos 17 dígitos.
 */
export function normalizarCuentaCliente(valor: string): string {
  const limpio = valor.trim().toUpperCase().replace(/[\s-]/g, "");
  if (limpio.startsWith("CR") && limpio.length === LARGO_IBAN_CR) {
    return soloDigitos(limpio).slice(-LARGO_CUENTA_CLIENTE);
  }
  return soloDigitos(limpio);
}

function fechaCompacta(fecha: string, campo: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha.trim());
  if (!partes) {
    throw new ErrorFormatoBncr(`La ${campo} debe venir como yyyy-mm-dd (recibido: "${fecha}").`);
  }
  return `${partes[1]}${partes[2]}${partes[3]}`;
}

/**
 * Dígito de control del lote: suma de los montos en céntimos más los dígitos de
 * las cuentas destino, truncada a los 12 dígitos del campo. Sirve para que el
 * banco detecte un archivo alterado o truncado después de generado.
 */
export function calcularChecksum(detalles: DetalleBncr[]): number {
  const suma = detalles.reduce((total, detalle) => {
    const digitosCuenta = [...soloDigitos(detalle.cuentaCliente)].reduce(
      (parcial, digito) => parcial + Number(digito),
      0,
    );
    return total + detalle.montoCentimos + digitosCuenta;
  }, 0);
  return suma % 1_000_000_000_000;
}

function validarLote(lote: LoteBncr): void {
  if (lote.detalles.length === 0) {
    throw new ErrorFormatoBncr("El lote no tiene ningún pago que exportar.");
  }
  if (!esCuentaClienteValida(lote.cuentaDebito)) {
    throw new ErrorFormatoBncr(
      "La cuenta débito de origen debe ser la cuenta cliente de 17 dígitos, no el IBAN de 22.",
    );
  }
  if (!normalizarTexto(lote.nombreEmpresa)) {
    throw new ErrorFormatoBncr("Falta el nombre de la empresa que origina el pago.");
  }
  if (!soloDigitos(lote.cedulaEmpresa)) {
    throw new ErrorFormatoBncr("Falta la cédula jurídica de la empresa que origina el pago.");
  }

  for (const [indice, detalle] of lote.detalles.entries()) {
    const etiqueta = `${detalle.nombre || `beneficiario ${indice + 1}`}`;
    if (!esCuentaClienteValida(detalle.cuentaCliente)) {
      throw new ErrorFormatoBncr(
        `La cuenta de ${etiqueta} no es una cuenta cliente de 17 dígitos (el banco rechaza el IBAN de 22).`,
      );
    }
    if (!Number.isInteger(detalle.montoCentimos) || detalle.montoCentimos <= 0) {
      throw new ErrorFormatoBncr(`El monto de ${etiqueta} debe ser mayor a cero.`);
    }
    if (!normalizarTexto(detalle.nombre)) {
      throw new ErrorFormatoBncr(`Falta el nombre del beneficiario en la línea ${indice + 1}.`);
    }
    if (!normalizarTexto(detalle.concepto)) {
      throw new ErrorFormatoBncr(`Falta el concepto del pago de ${etiqueta}.`);
    }
  }
}

/** Arma el archivo completo (tipos 1, 2, 3…N y 4) listo para subir al BN Internet Banking. */
export function construirArchivoBncr(lote: LoteBncr): ArchivoBncr {
  validarLote(lote);

  const moneda = CODIGO_MONEDA[lote.moneda];
  const totalCentimos = lote.detalles.reduce((total, detalle) => total + detalle.montoCentimos, 0);
  const cantidadDetalles = lote.detalles.length;
  const fecha = fechaCompacta(lote.fechaAplicacion, "fecha de aplicación");

  const encabezado = construirLinea(LAYOUT_TIPO_1, {
    tipoRegistro: 1,
    cedulaEmpresa: lote.cedulaEmpresa,
    nombreEmpresa: lote.nombreEmpresa,
    fechaAplicacion: fecha,
    moneda,
    consecutivoLote: lote.consecutivo,
    descripcionLote: lote.descripcion,
  });

  const cuentaOrigen = construirLinea(LAYOUT_TIPO_2, {
    tipoRegistro: 2,
    cuentaDebito: normalizarCuentaCliente(lote.cuentaDebito),
    montoTotal: totalCentimos,
    cantidadDetalles,
    moneda,
    descripcionLote: lote.descripcion,
  });

  const detalles = lote.detalles.map((detalle, indice) =>
    construirLinea(LAYOUT_TIPO_3, {
      tipoRegistro: 3,
      consecutivoLinea: indice + 1,
      cuentaCliente: normalizarCuentaCliente(detalle.cuentaCliente),
      cedulaBeneficiario: soloDigitos(detalle.cedula),
      nombreBeneficiario: detalle.nombre,
      monto: detalle.montoCentimos,
      moneda,
      concepto: detalle.concepto,
    }),
  );

  const cierre = construirLinea(LAYOUT_TIPO_4, {
    tipoRegistro: 4,
    cantidadDetalles,
    montoTotal: totalCentimos,
    checksum: calcularChecksum(lote.detalles),
  });

  const lineas = [encabezado, cuentaOrigen, ...detalles, cierre];
  return {
    // CRLF y salto final: es lo que espera el lector del banco (archivo DOS).
    contenido: `${lineas.join("\r\n")}\r\n`,
    lineas,
    totalCentimos,
    cantidadDetalles,
  };
}

export type ExtensionArchivo = "txt" | "env";

export function nombreArchivoLote(
  tipo: "planilla" | "proveedores",
  consecutivo: number,
  fechaAplicacion: string,
  extension: ExtensionArchivo = "txt",
): string {
  const fecha = fechaCompacta(fechaAplicacion, "fecha de aplicación");
  return `BNCR_${tipo.toUpperCase()}_${fecha}_${String(consecutivo).padStart(6, "0")}.${extension}`;
}
