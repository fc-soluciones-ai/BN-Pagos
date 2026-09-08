/**
 * URL del Portal Madre (FC-Enterprise-Portal): a dónde se manda a un usuario
 * sin sesión y a dónde vuelve el botón "Portal".
 *
 * El Portal nunca corre local en el flujo de trabajo de este módulo, así que
 * una `NEXT_PUBLIC_PORTAL_URL` vacía o apuntando a localhost se ignora — es
 * preferible mandar a producción que dejar a un usuario real en una URL que
 * en su máquina no existe.
 */

const PORTAL_URL_PRODUCCION = "https://fc-enterprise-portal.vercel.app";

function esLocalhost(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(url);
}

export function getPortalUrl(): string {
  const configurada = process.env.NEXT_PUBLIC_PORTAL_URL?.trim();
  if (configurada && !esLocalhost(configurada)) return configurada;
  return PORTAL_URL_PRODUCCION;
}
