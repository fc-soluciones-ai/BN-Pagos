"use client";

/** Descarga texto plano como archivo, sin tocar el DOM permanente. */
export function descargarTexto(nombreArchivo: string, contenido: string): void {
  const blob = new Blob([contenido], { type: "text/plain;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.click();
  URL.revokeObjectURL(url);
}
