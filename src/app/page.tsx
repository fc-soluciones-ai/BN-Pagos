"use client";

import { useState } from "react";

import { CatalogoBeneficiarios } from "@/components/CatalogoBeneficiarios";
import { GeneradorLote } from "@/components/GeneradorLote";
import { HistorialLotes } from "@/components/HistorialLotes";
import { Tabs } from "@/components/ui";

type Pestana = "planilla" | "proveedores" | "empleados" | "catalogo-proveedores" | "historial";

const PESTANAS = [
  ["planilla", "Pago de planilla"],
  ["proveedores", "Pago de proveedores"],
  ["empleados", "Catálogo empleados"],
  ["catalogo-proveedores", "Catálogo proveedores"],
  ["historial", "Historial"],
] as const;

export default function Home() {
  const [pestana, setPestana] = useState<Pestana>("planilla");

  return (
    <div className="space-y-4">
      <Tabs opciones={PESTANAS} valor={pestana} onChange={setPestana} />

      {pestana === "planilla" && <GeneradorLote tipo="planilla" />}
      {pestana === "proveedores" && <GeneradorLote tipo="proveedores" />}
      {pestana === "empleados" && <CatalogoBeneficiarios tipo="empleado" />}
      {pestana === "catalogo-proveedores" && <CatalogoBeneficiarios tipo="proveedor" />}
      {pestana === "historial" && <HistorialLotes />}
    </div>
  );
}
