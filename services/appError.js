class AppError extends Error {
    constructor(status, message, detalles) {
        super(message);
        this.name = "AppError";
        this.status = status;
        this.detalles = detalles;
    }
}

module.exports = AppError;
