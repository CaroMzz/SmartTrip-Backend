const nodemailer = require("nodemailer");
const config = require("../config");

const smtpConfigurado = () => Boolean(
    config.smtpHost && config.smtpUser && config.smtpPassword && config.smtpFrom
);

// Brevo envía por HTTPS: sirve en hostings que bloquean los puertos SMTP (como el plan gratis de Render).
const brevoConfigurado = () => Boolean(config.brevoApiKey && config.smtpFrom);

const estaConfigurado = () => brevoConfigurado() || smtpConfigurado();

// Acepta "Nombre <correo@dominio>" o solo el correo.
const separarRemitente = (remitente) => {
    const coincidencia = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(remitente);
    return coincidencia
        ? { name: coincidencia[1].replace(/^"|"$/g, "") || "SmartTrip", email: coincidencia[2] }
        : { name: "SmartTrip", email: remitente.trim() };
};

const enviarConBrevo = async (mensaje) => {
    let respuesta;
    try {
        respuesta = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: { "api-key": config.brevoApiKey, "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
                sender: separarRemitente(config.smtpFrom),
                to: [{ email: mensaje.to }],
                subject: mensaje.subject,
                textContent: mensaje.text,
                htmlContent: mensaje.html
            }),
            signal: AbortSignal.timeout(12000)
        });
    } catch (error) {
        throw new Error(`No se pudo conectar con Brevo: ${error.message}`);
    }
    if (!respuesta.ok) throw new Error(`Brevo respondió HTTP ${respuesta.status}: ${(await respuesta.text()).slice(0, 300)}`);
};

let transporter;
const obtenerTransporter = () => {
    if (!smtpConfigurado()) return null;
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: config.smtpHost,
            port: config.smtpPort,
            secure: config.smtpPort === 465,
            requireTLS: config.smtpPort !== 465,
            auth: { user: config.smtpUser, pass: config.smtpPassword },
            connectionTimeout: 8000,
            greetingTimeout: 8000,
            socketTimeout: 12000
        });
    }
    return transporter;
};

const escaparHtml = (texto) => String(texto)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const crearEnlaceVerificacion = (token) => {
    const base = new URL(config.frontendUrl);
    const enlace = new URL(config.emailVerificationPath, base);
    enlace.searchParams.set("token", token);
    return enlace.toString();
};

const enviarVerificacion = async ({ correo, nombre, token }) => {
    if (!estaConfigurado()) return false;
    const enlace = crearEnlaceVerificacion(token);
    const enlaceHtml = escaparHtml(enlace);
    const nombreHtml = escaparHtml(nombre);
    const mensaje = {
        from: config.smtpFrom,
        to: correo,
        subject: "Confirmá tu correo para SmartTrip",
        text: `Hola ${nombre},\n\nPara confirmar tu correo y empezar a planificar, abrí este enlace:\n${enlace}\n\nEl enlace vence dentro de 24 horas.`,
        html: `<p>Hola ${nombreHtml},</p><p>Para confirmar tu correo y empezar a planificar, abrí este enlace:</p><p><a href="${enlaceHtml}">Confirmar mi correo</a></p><p>El enlace vence dentro de 24 horas.</p>`
    };
    if (brevoConfigurado()) await enviarConBrevo(mensaje);
    else await obtenerTransporter().sendMail(mensaje);
    return true;
};

module.exports = { estaConfigurado, enviarVerificacion };
