/**
 * Motor del archivo plano de ancho fijo de "Pago de Planillas" de BN Internet
 * Corporativo (BNCR), extensión .env.
 *
 * El layout NO sale de la especificación verbal del banco sino de un archivo
 * real ya procesado por BNCR, reconstruido byte a byte en la app de Planillas
 * (`lib/planillas/exportadores/bncr.ts` de fc-app-template): 68 caracteres por
 * línea, beneficiario identificado por código de banco + cédula, y sin ningún
 * campo de cuenta cliente de 17 dígitos ni de moneda.
 *
 *   Tipo 1 (encabezado): numérico(68) — cliente/convenio y fecha de envío.
 *   Tipo 2 (débito):     numérico(36) + concepto(30) + '00' — total del lote.
 *   Tipo 3 (crédito):    numérico(36) + concepto(30) + '00' — uno por beneficiario.
 *   Tipo 4 (cierre):     cantidad de créditos + monto total. SIN CONFIRMAR.
 *
 * Bloque numérico (36) de las líneas 2 y 3: prefijo(1) + banco(3) +
 * constante(5) + identificador(9) + secuencia(6) + monto en céntimos(12). La
 * constante ('10001' en el débito, '20001' en cada crédito) apareció idéntica
 * en las 20 líneas de crédito del archivo real pese a ser 20 personas en 4
 * bancos distintos, así que se trata como literal del layout.
 *
 * SIN CONFIRMAR: la línea tipo 4 del archivo real trae, además del bloque
 * numérico, una cadena alfanumérica de 10 caracteres que no se pudo descifrar
 * con una sola muestra — huele a control generado por el propio sistema del
 * banco. Acá va en ceros. Antes de un envío real conviene probar con un monto
 * pequeño: si el banco la valida y la rechaza, es un fallo seguro (no mueve
 * plata mal), pero mejor saberlo de antemano.
 */

export const ANCHO_LINEA = 68;
export const ANCHO_BLOQUE_NUMERICO = 36;
export const ANCHO_CONCEPTO = 30;

/** Cédula física del beneficiario: 9 dígitos, es el identificador del crédito. */
export const ANCHO_IDENTIFICADOR = 9;
export const LARGO_IBAN_CR = 22;

/** Código de banco del BNCR para la cuenta patronal que origina el débito. */
const CODIGO_BANCO_BNCR = "056";
const CONSTANTE_DEBITO = "10001";
const CONSTANTE_CREDITO = "20001";
const SALTO = "\r\n";

/**
 * Códigos de banco de Costa Rica observados en archivos reales (056, 002, 021
 * y 153 confirmados por el cliente; 031 por aparecer en el archivo de
 * ejemplo). No es la tabla oficial completa del sistema financiero: si un
 * banco no está acá se rechaza el lote en vez de adivinar un código, porque un
 * código equivocado manda la plata a otra entidad.
 */
const CODIGOS_BANCO: Record<string, string> = {
  "banco nacional": "056",
  "banco nacional de costa rica": "056",
  bncr: "056",
  bn: "056",
  bac: "002",
  "bac san jose": "002",
  "bac credomatic": "002",
  "banco de costa rica": "021",
  bcr: "021",
  "banco popular": "153",
  popular: "153",
  scotiabank: "031",
};

/** Bancos que se pueden elegir en el catálogo, ya listos para un `<select>`. */
export const BANCOS_SOPORTADOS = [
  "Banco Nacional",
  "BAC San José",
  "Banco de Costa Rica",
  "Banco Popular",
  "Scotiabank",
] as const;

export type MonedaBncr = "CRC" | "USD";

export interface DetalleBncr {
  /** Cédula física del beneficiario (9 dígitos). */
  cedula: string;
  nombre: string;
  /** Nombre del banco destino: se traduce al código de 3 dígitos del layout. */
  banco: string;
  concepto: string;
  /** Monto en céntimos (colones × 100), ya acumulado de todos sus rubros. */
  montoCentimos: number;
}

export interface LoteBncr {
  /** Código de cliente/convenio ante BNCR (6 dígitos). */
  numeroCliente: string;
  /** Cuenta patronal del BNCR de la que sale la plata (9 dígitos, no el IBAN). */
  cuentaOrigen: string;
  /** Fecha de envío en formato yyyy-mm-dd (la del `<input type="date">`). */
  fechaAplicacion: string;
  /** Va en el concepto de la línea de débito. */
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

function normalizarNombreBanco(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Código de 3 dígitos del banco, o null si no está en la tabla conocida. */
export function codigoBancoDesde(nombreBanco: string): string | null {
  return CODIGOS_BANCO[normalizarNombreBanco(nombreBanco ?? "")] ?? null;
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

function campoConcepto(valor: string): string {
  return normalizarTexto(valor).slice(0, ANCHO_CONCEPTO).padEnd(ANCHO_CONCEPTO, " ");
}

function ceros(ancho: number): string {
  return "0".repeat(ancho);
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

/**
 * Acepta el IBAN de Costa Rica (22 caracteres) o los 17 dígitos de la cuenta
 * cliente y devuelve siempre el IBAN normalizado en mayúsculas y sin espacios.
 * El archivo del banco no lleva la cuenta, pero el catálogo la guarda igual:
 * es el dato con el que el cliente verifica a quién le está pagando.
 */
export function normalizarIban(valor: string): string {
  return valor.trim().toUpperCase().replace(/[\s-]/g, "");
}

export function esIbanCostaRicaValido(valor: string): boolean {
  return /^CR\d{20}$/.test(normalizarIban(valor));
}

/** ddmmyyyy, que es como viene la fecha en el archivo real. */
function fechaCompacta(fecha: string, campo: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha.trim());
  if (!partes) {
    throw new ErrorFormatoBncr(`La ${campo} debe venir como yyyy-mm-dd (recibido: "${fecha}").`);
  }
  return `${partes[3]}${partes[2]}${partes[1]}`;
}

function bloqueNumerico(campos: string[], tipo: number): string {
  const bloque = campos.join("");
  if (bloque.length !== ANCHO_BLOQUE_NUMERICO) {
    throw new ErrorFormatoBncr(
      `La línea tipo ${tipo} armó ${bloque.length} dígitos y el layout exige ${ANCHO_BLOQUE_NUMERICO}.`,
    );
  }
  return bloque;
}

function validarLote(lote: LoteBncr): void {
  if (lote.detalles.length === 0) {
    throw new ErrorFormatoBncr("El lote no tiene ningún pago que exportar.");
  }
  if (soloDigitos(lote.numeroCliente).length === 0) {
    throw new ErrorFormatoBncr(
      "Falta el número de cliente/convenio de la empresa ante el BNCR (6 dígitos).",
    );
  }
  if (soloDigitos(lote.cuentaOrigen).length === 0) {
    throw new ErrorFormatoBncr(
      "Falta la cuenta patronal del BNCR de la que se debita el total (9 dígitos, no el IBAN).",
    );
  }

  for (const [indice, detalle] of lote.detalles.entries()) {
    const etiqueta = detalle.nombre || `beneficiario ${indice + 1}`;
    if (!codigoBancoDesde(detalle.banco)) {
      throw new ErrorFormatoBncr(
        `No se reconoce el banco "${detalle.banco}" de ${etiqueta}: revisá el campo Banco en el catálogo.`,
      );
    }
    if (soloDigitos(detalle.cedula).length === 0) {
      throw new ErrorFormatoBncr(`Falta la cédula de ${etiqueta}.`);
    }
    if (!Number.isInteger(detalle.montoCentimos) || detalle.montoCentimos <= 0) {
      throw new ErrorFormatoBncr(`El monto de ${etiqueta} debe ser mayor a cero.`);
    }
    if (!normalizarTexto(detalle.concepto)) {
      throw new ErrorFormatoBncr(`Falta el concepto del pago de ${etiqueta}.`);
    }
  }
}

/** Arma el archivo completo (tipos 1, 2, 3…N y 4) listo para subir a BN Internet Corporativo. */
export function construirArchivoBncr(lote: LoteBncr): ArchivoBncr {
  validarLote(lote);

  const totalCentimos = lote.detalles.reduce((total, detalle) => total + detalle.montoCentimos, 0);
  const cantidadDetalles = lote.detalles.length;

  // Tipo 1: a diferencia de las otras líneas es un único bloque numérico de 68
  // sin campo de concepto.
  const encabezado = [
    "1",
    campoNumerico(lote.numeroCliente, 6, "número de cliente"),
    fechaCompacta(lote.fechaAplicacion, "fecha de envío"),
    ceros(53),
  ].join("");

  // Tipo 2: débito de la cuenta patronal por el total del lote.
  const debito =
    bloqueNumerico(
      [
        "2",
        CODIGO_BANCO_BNCR,
        CONSTANTE_DEBITO,
        campoNumerico(lote.cuentaOrigen, ANCHO_IDENTIFICADOR, "cuenta patronal"),
        campoNumerico(1, 6, "secuencia"),
        campoNumerico(totalCentimos, 12, "monto total"),
      ],
      2,
    ) +
    campoConcepto(lote.descripcion) +
    "00";

  // Tipo 3: un crédito por beneficiario, con el acumulado de sus rubros. La
  // secuencia arranca en 2 porque el débito ocupa la 1.
  const creditos = lote.detalles.map((detalle, indice) => {
    const codigoBanco = codigoBancoDesde(detalle.banco)!;
    return (
      bloqueNumerico(
        [
          "3",
          codigoBanco,
          CONSTANTE_CREDITO,
          campoNumerico(detalle.cedula, ANCHO_IDENTIFICADOR, `cédula de ${detalle.nombre}`),
          campoNumerico(indice + 2, 6, "secuencia"),
          campoNumerico(detalle.montoCentimos, 12, `monto de ${detalle.nombre}`),
        ],
        3,
      ) +
      campoConcepto(detalle.concepto) +
      "00"
    );
  });

  // Tipo 4: cierre. El tramo alfanumérico de control queda en ceros a
  // propósito — ver la nota "SIN CONFIRMAR" al inicio del archivo.
  const cierre = [
    "4",
    campoNumerico(cantidadDetalles, 7, "cantidad de créditos"),
    campoNumerico(totalCentimos, 18, "monto total"),
    ceros(10),
    ceros(32),
  ].join("");

  const lineas = [encabezado, debito, ...creditos, cierre];

  for (const [indice, linea] of lineas.entries()) {
    if (linea.length !== ANCHO_LINEA) {
      throw new ErrorFormatoBncr(
        `La línea ${indice + 1} quedó de ${linea.length} caracteres y el banco exige ${ANCHO_LINEA}.`,
      );
    }
  }

  return {
    // CRLF y salto final: el archivo real viene así (formato DOS).
    contenido: `${lineas.join(SALTO)}${SALTO}`,
    lineas,
    totalCentimos,
    cantidadDetalles,
  };
}

export type ExtensionArchivo = "env" | "txt";

export function nombreArchivoLote(
  tipo: "planilla" | "proveedores",
  consecutivo: number,
  fechaAplicacion: string,
  extension: ExtensionArchivo = "env",
): string {
  const fecha = fechaCompacta(fechaAplicacion, "fecha de envío");
  return `BNCR_${tipo.toUpperCase()}_${fecha}_${String(consecutivo).padStart(6, "0")}.${extension}`;
}
