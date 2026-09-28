const nodemailer = require("nodemailer");
const config = require("../config");

const estaConfigurado = () => Boolean(
    config.smtpHost && config.smtpUser && config.smtpPassword && config.smtpFrom
);

let transporter;
const obtenerTransporter = () => {
    if (!estaConfigurado()) return null;
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
    const envio = obtenerTransporter();
    if (!envio) return false;
    const enlace = crearEnlaceVerificacion(token);
    const enlaceHtml = escaparHtml(enlace);
    const nombreHtml = escaparHtml(nombre);
    await envio.sendMail({
        from: config.smtpFrom,
        to: correo,
        subject: "Confirmá tu correo para SmartTrip",
        text: `Hola ${nombre},\n\nPara confirmar tu correo y empezar a planificar, abrí este enlace:\n${enlace}\n\nEl enlace vence dentro de 24 horas.`,
        html: `<p>Hola ${nombreHtml},</p><p>Para confirmar tu correo y empezar a planificar, abrí este enlace:</p><p><a href="${enlaceHtml}">Confirmar mi correo</a></p><p>El enlace vence dentro de 24 horas.</p>`
    });
    return true;
};

module.exports = { estaConfigurado, enviarVerificacion };
