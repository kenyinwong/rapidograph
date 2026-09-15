/**
 * Acceso con Google (Google Identity Services).
 *
 * Para activarlo hay que crear un "ID de cliente OAuth" propio (es gratis):
 *   1. Entrar a https://console.cloud.google.com/apis/credentials
 *   2. Crear proyecto (si no hay) → Crear credenciales → ID de cliente OAuth
 *      → Tipo: Aplicación web.
 *   3. En "Orígenes de JavaScript autorizados" agregar:
 *        https://kenyinwong.github.io
 *        http://localhost:8765   (solo si se usa también en local)
 *   4. Copiar el ID (termina en .apps.googleusercontent.com) aquí abajo.
 *
 * Con el campo vacío, el botón de Google explica estos pasos en vez de fallar.
 * La verificación ocurre en el navegador con la librería oficial de Google;
 * esta aplicación solo recibe el correo verificado, no contraseñas ni tokens
 * de acceso a otros servicios.
 */
export const GOOGLE_CLIENT_ID = ''
