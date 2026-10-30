/**
 * PRUEBAS UNITARIAS - emailService
 *
 * Prueba el servicio de correos salientes:
 * - detección de SMTP configurado / no configurado
 * - armado de enlaces con tokens seguros y frontendUrl
 * - escapado de caracteres HTML para prevenir inyecciones
 * - envío exitoso vía nodemailer
 */

jest.mock("nodemailer");
jest.mock("../config", () => ({
    smtpHost: "smtp.mailtrap.io",
    smtpPort: 587,
    smtpUser: "usuario_smtp",
    smtpPassword: "password_smtp",
    smtpFrom: "no-reply@smarttrip.com",
    frontendUrl: "https://smarttrip.app",
    emailVerificationPath: "/confirmar-correo"
}));

const nodemailer = require("nodemailer");
const emailService = require("../services/emailService");

describe("emailService", () => {
    let sendMailMock;

    beforeEach(() => {
        jest.clearAllMocks();
        sendMailMock = jest.fn().mockResolvedValue({ messageId: "msg-123" });
        nodemailer.createTransport.mockReturnValue({
            sendMail: sendMailMock
        });
    });

    describe("estaConfigurado", () => {
        it("debería retornar true si los parámetros SMTP están presentes", () => {
            expect(emailService.estaConfigurado()).toBe(true);
        });
    });

    describe("enviarVerificacion", () => {
        it("debería enviar el correo de verificación con URL correcta y caracteres escapados", async () => {
            const datos = {
                correo: "usuario@ejemplo.com",
                nombre: "Carla & Lucas <Test>",
                token: "token_seguro_xyz_123"
            };

            const resultado = await emailService.enviarVerificacion(datos);

            expect(resultado).toBe(true);
            expect(sendMailMock).toHaveBeenCalledTimes(1);

            const mailOptions = sendMailMock.mock.calls[0][0];
            expect(mailOptions.to).toBe("usuario@ejemplo.com");
            expect(mailOptions.from).toBe("no-reply@smarttrip.com");
            expect(mailOptions.subject).toContain("Confirmá tu correo");

            // Verifica que el token esté en el enlace
            expect(mailOptions.text).toContain("token=token_seguro_xyz_123");
            expect(mailOptions.html).toContain("https://smarttrip.app/confirmar-correo?token=token_seguro_xyz_123");

            // Verifica que los caracteres especiales del nombre se hayan escapado en el HTML
            expect(mailOptions.html).toContain("Carla &amp; Lucas &lt;Test&gt;");
        });
    });
});
