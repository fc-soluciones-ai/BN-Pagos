import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ErrorFormatoBncr,
  LAYOUT_TIPO_1,
  LAYOUT_TIPO_2,
  LAYOUT_TIPO_3,
  LAYOUT_TIPO_4,
  aCentimos,
  calcularChecksum,
  construirArchivoBncr,
  esCuentaClienteValida,
  largoLinea,
  nombreArchivoLote,
  normalizarCuentaCliente,
  normalizarTexto,
  type LoteBncr,
} from "./formato";

const CUENTA_A = "15100010012345678";
const CUENTA_B = "15100010087654321";

function lote(extra: Partial<LoteBncr> = {}): LoteBncr {
  return {
    cedulaEmpresa: "3101123456",
    nombreEmpresa: "Distribuidora Ñandú S.A.",
    cuentaDebito: CUENTA_A,
    moneda: "CRC",
    fechaAplicacion: "2026-03-05",
    consecutivo: 12,
    descripcion: "Planilla quincenal",
    detalles: [
      {
        cuentaCliente: CUENTA_B,
        cedula: "1-0234-0567",
        nombre: "José Fernández Ávila",
        concepto: "Salario base + lavado de carro",
        montoCentimos: 45_000_00,
      },
    ],
    ...extra,
  };
}

test("normalizarTexto pasa a mayúsculas sin tildes ni caracteres raros", () => {
  assert.equal(normalizarTexto("José Fernández Ávila"), "JOSE FERNANDEZ AVILA");
  assert.equal(normalizarTexto("Peña  &  Cía"), "PENA CIA");
});

test("la cuenta cliente son 17 dígitos y el IBAN se normaliza a esos 17", () => {
  assert.ok(esCuentaClienteValida(CUENTA_A));
  assert.ok(!esCuentaClienteValida("CR21015100010012345678"));
  assert.equal(normalizarCuentaCliente("CR21 0151 0001 0012 3456 78"), CUENTA_A);
  assert.equal(normalizarCuentaCliente(CUENTA_A), CUENTA_A);
});

test("aCentimos evita el error de coma flotante", () => {
  assert.equal(aCentimos(1234.56), 123456);
  assert.equal(aCentimos(0.07), 7);
});

test("cada línea mide exactamente lo que dice su layout y el archivo cierra con CRLF", () => {
  const archivo = construirArchivoBncr(lote());
  const [encabezado, origen, detalle, cierre] = archivo.lineas;

  assert.equal(encabezado.length, largoLinea(LAYOUT_TIPO_1));
  assert.equal(origen.length, largoLinea(LAYOUT_TIPO_2));
  assert.equal(detalle.length, largoLinea(LAYOUT_TIPO_3));
  assert.equal(cierre.length, largoLinea(LAYOUT_TIPO_4));
  assert.equal(archivo.contenido, `${archivo.lineas.join("\r\n")}\r\n`);
});

test("el encabezado lleva la fecha compacta y el detalle el monto en céntimos a 12 dígitos", () => {
  const archivo = construirArchivoBncr(lote());
  const encabezado = archivo.lineas[0];
  const detalle = archivo.lineas[2];

  assert.equal(encabezado.slice(0, 1), "1");
  assert.equal(encabezado.slice(53, 61), "20260305");
  assert.equal(detalle.slice(1, 7), "000001");
  assert.equal(detalle.slice(7, 24), CUENTA_B);
  assert.equal(detalle.slice(76, 88), "000004500000");
  // El concepto ocupa siempre los últimos 30 caracteres, en mayúsculas.
  assert.equal(detalle.slice(-30), "SALARIO BASE LAVADO DE CARRO  ");
});

test("el tipo 2 y el tipo 4 cuadran con la suma de los detalles", () => {
  const archivo = construirArchivoBncr(
    lote({
      detalles: [
        { cuentaCliente: CUENTA_B, cedula: "102340567", nombre: "Ana Mora", concepto: "Salario", montoCentimos: 100_00 },
        { cuentaCliente: CUENTA_A, cedula: "203450678", nombre: "Luis Rojas", concepto: "Salario", montoCentimos: 250_00 },
      ],
    }),
  );

  assert.equal(archivo.totalCentimos, 350_00);
  assert.equal(archivo.cantidadDetalles, 2);
  assert.equal(archivo.lineas[1].slice(18, 30), "000000035000");
  assert.equal(archivo.lineas[1].slice(30, 36), "000002");
  assert.equal(archivo.lineas[archivo.lineas.length - 1].slice(1, 19), "000002000000035000");
});

test("el checksum es determinista y depende de montos y cuentas", () => {
  const detalles = lote().detalles;
  assert.equal(calcularChecksum(detalles), calcularChecksum(detalles));
  assert.notEqual(
    calcularChecksum(detalles),
    calcularChecksum([{ ...detalles[0], montoCentimos: detalles[0].montoCentimos + 1 }]),
  );
});

test("rechaza lotes vacíos, IBAN en el detalle y montos no positivos", () => {
  assert.throws(() => construirArchivoBncr(lote({ detalles: [] })), ErrorFormatoBncr);
  assert.throws(
    () =>
      construirArchivoBncr(
        lote({
          detalles: [
            { cuentaCliente: "CR21015100010012345678", cedula: "1", nombre: "Ana", concepto: "Salario", montoCentimos: 100 },
          ],
        }),
      ),
    ErrorFormatoBncr,
  );
  assert.throws(
    () =>
      construirArchivoBncr(
        lote({
          detalles: [{ cuentaCliente: CUENTA_B, cedula: "1", nombre: "Ana", concepto: "Salario", montoCentimos: 0 }],
        }),
      ),
    ErrorFormatoBncr,
  );
  assert.throws(() => construirArchivoBncr(lote({ fechaAplicacion: "05/03/2026" })), ErrorFormatoBncr);
});

test("el nombre del archivo incluye tipo, fecha y consecutivo", () => {
  assert.equal(nombreArchivoLote("planilla", 12, "2026-03-05"), "BNCR_PLANILLA_20260305_000012.txt");
  assert.equal(nombreArchivoLote("proveedores", 3, "2026-03-05", "env"), "BNCR_PROVEEDORES_20260305_000003.env");
});
