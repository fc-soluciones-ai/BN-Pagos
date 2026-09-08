import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ANCHO_LINEA,
  ErrorFormatoBncr,
  aCentimos,
  codigoBancoDesde,
  construirArchivoBncr,
  esIbanCostaRicaValido,
  nombreArchivoLote,
  normalizarIban,
  normalizarTexto,
  type LoteBncr,
} from "./formato";

function lote(extra: Partial<LoteBncr> = {}): LoteBncr {
  return {
    numeroCliente: "123456",
    cuentaOrigen: "100234567",
    fechaAplicacion: "2026-03-05",
    descripcion: "Planilla quincenal",
    detalles: [
      {
        cedula: "1-0234-0567",
        nombre: "José Fernández Ávila",
        banco: "Banco Nacional",
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

test("el IBAN de Costa Rica se normaliza y se valida a 22 caracteres", () => {
  assert.equal(normalizarIban("cr21 0151 0001 0012 3456 78"), "CR21015100010012345678");
  assert.ok(esIbanCostaRicaValido("CR21 0151 0001 0012 3456 78"));
  assert.ok(!esIbanCostaRicaValido("15100010012345678"));
});

test("el banco se traduce a su código de 3 dígitos sin importar tildes ni mayúsculas", () => {
  assert.equal(codigoBancoDesde("Banco Nacional"), "056");
  assert.equal(codigoBancoDesde("BAC San José"), "002");
  assert.equal(codigoBancoDesde("bcr"), "021");
  assert.equal(codigoBancoDesde("Banco Lafise"), null);
});

test("aCentimos evita el error de coma flotante", () => {
  assert.equal(aCentimos(1234.56), 123456);
  assert.equal(aCentimos(0.07), 7);
});

test("todas las líneas miden 68 caracteres y el archivo cierra con CRLF", () => {
  const archivo = construirArchivoBncr(lote());

  // Encabezado + débito + un crédito + cierre.
  assert.equal(archivo.lineas.length, 4);
  for (const linea of archivo.lineas) assert.equal(linea.length, ANCHO_LINEA);
  assert.equal(archivo.contenido, `${archivo.lineas.join("\r\n")}\r\n`);
});

test("el encabezado lleva el número de cliente y la fecha en ddmmyyyy", () => {
  const [encabezado] = construirArchivoBncr(lote()).lineas;

  assert.equal(encabezado.slice(0, 1), "1");
  assert.equal(encabezado.slice(1, 7), "123456");
  assert.equal(encabezado.slice(7, 15), "05032026");
  assert.equal(encabezado.slice(15), "0".repeat(53));
});

test("el crédito lleva banco, cédula a 9 dígitos, secuencia, monto y concepto", () => {
  const credito = construirArchivoBncr(lote()).lineas[2];

  assert.equal(credito.slice(0, 1), "3");
  assert.equal(credito.slice(1, 4), "056");
  assert.equal(credito.slice(4, 9), "20001");
  assert.equal(credito.slice(9, 18), "102340567");
  assert.equal(credito.slice(18, 24), "000002");
  assert.equal(credito.slice(24, 36), "000004500000");
  assert.equal(credito.slice(36, 66), "SALARIO BASE LAVADO DE CARRO  ");
  assert.equal(credito.slice(66), "00");
});

test("el débito y el cierre cuadran con la suma de los créditos", () => {
  const archivo = construirArchivoBncr(
    lote({
      detalles: [
        { cedula: "102340567", nombre: "Ana Mora", banco: "BCR", concepto: "Salario", montoCentimos: 100_00 },
        { cedula: "203450678", nombre: "Luis Rojas", banco: "BAC", concepto: "Salario", montoCentimos: 250_00 },
      ],
    }),
  );

  assert.equal(archivo.totalCentimos, 350_00);
  assert.equal(archivo.cantidadDetalles, 2);

  const debito = archivo.lineas[1];
  assert.equal(debito.slice(0, 9), "2" + "056" + "10001");
  assert.equal(debito.slice(18, 24), "000001");
  assert.equal(debito.slice(24, 36), "000000035000");

  const cierre = archivo.lineas[archivo.lineas.length - 1];
  assert.equal(cierre.slice(0, 8), "40000002");
  assert.equal(cierre.slice(8, 26), "000000000000035000");
});

test("la secuencia de los créditos arranca en 2 porque el débito ocupa la 1", () => {
  const archivo = construirArchivoBncr(
    lote({
      detalles: [
        { cedula: "102340567", nombre: "Ana Mora", banco: "BCR", concepto: "Salario", montoCentimos: 100_00 },
        { cedula: "203450678", nombre: "Luis Rojas", banco: "BAC", concepto: "Salario", montoCentimos: 250_00 },
      ],
    }),
  );

  assert.equal(archivo.lineas[2].slice(18, 24), "000002");
  assert.equal(archivo.lineas[3].slice(18, 24), "000003");
});

test("rechaza lotes vacíos, bancos desconocidos, montos no positivos y fechas mal escritas", () => {
  assert.throws(() => construirArchivoBncr(lote({ detalles: [] })), ErrorFormatoBncr);
  assert.throws(
    () =>
      construirArchivoBncr(
        lote({
          detalles: [
            { cedula: "102340567", nombre: "Ana", banco: "Banco Lafise", concepto: "Salario", montoCentimos: 100 },
          ],
        }),
      ),
    ErrorFormatoBncr,
  );
  assert.throws(
    () =>
      construirArchivoBncr(
        lote({
          detalles: [
            { cedula: "102340567", nombre: "Ana", banco: "BCR", concepto: "Salario", montoCentimos: 0 },
          ],
        }),
      ),
    ErrorFormatoBncr,
  );
  assert.throws(() => construirArchivoBncr(lote({ fechaAplicacion: "05/03/2026" })), ErrorFormatoBncr);
  assert.throws(() => construirArchivoBncr(lote({ numeroCliente: "" })), ErrorFormatoBncr);
});

test("el nombre del archivo incluye tipo, fecha y consecutivo", () => {
  assert.equal(nombreArchivoLote("planilla", 12, "2026-03-05"), "BNCR_PLANILLA_05032026_000012.env");
  assert.equal(
    nombreArchivoLote("proveedores", 3, "2026-03-05", "txt"),
    "BNCR_PROVEEDORES_05032026_000003.txt",
  );
});
