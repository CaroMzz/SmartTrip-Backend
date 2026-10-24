// Prioridades del usuario (RF08). Cada clave es un porcentaje entero y la suma debe dar 100.
// La columna indica dónde se guarda en smarttrip.preferencia.
const CRITERIOS = Object.freeze({
    ahorro: "minimizar_costo",
    distancia: "reducir_distancia",
    atractivos: "maximizar_turismo",
    alojamiento: "minimizar_cambios_alojamiento",
    tren: "priorizar_tren",
    panoramicas: "priorizar_rutas_panoramicas"
});

const CLAVES = Object.freeze(Object.keys(CRITERIOS));

const POR_DEFECTO = Object.freeze({ ahorro: 60, distancia: 0, atractivos: 40, alojamiento: 0, tren: 0, panoramicas: 0 });

// Acepta el formato completo o el anterior { ahorro, atractivos }: las claves omitidas valen 0.
const validar = (datos) => {
    if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
        return { error: "Las prioridades deben ser un objeto con porcentajes" };
    }
    const desconocidas = Object.keys(datos).filter((clave) => !CLAVES.includes(clave));
    if (desconocidas.length) return { error: `Prioridades no reconocidas: ${desconocidas.join(", ")}` };

    const prioridades = {};
    for (const clave of CLAVES) {
        const valor = datos[clave] ?? 0;
        if (!Number.isInteger(valor) || valor < 0 || valor > 100) {
            return { error: `La prioridad "${clave}" debe ser un entero entre 0 y 100` };
        }
        prioridades[clave] = valor;
    }
    const suma = CLAVES.reduce((total, clave) => total + prioridades[clave], 0);
    if (suma !== 100) return { error: `Las prioridades deben sumar 100 (suman ${suma})` };
    return { prioridades };
};

// Convierte una fila de smarttrip.preferencia (o null) al objeto de prioridades.
const desdeFila = (fila) => {
    if (!fila) return { ...POR_DEFECTO };
    return Object.fromEntries(CLAVES.map((clave) => [clave, Number(fila[CRITERIOS[clave]] ?? 0)]));
};

// Valores en el orden de COLUMNAS, para usar como parámetros de INSERT/UPDATE.
const COLUMNAS = Object.freeze(CLAVES.map((clave) => CRITERIOS[clave]));
const comoParametros = (prioridades) => CLAVES.map((clave) => prioridades?.[clave] ?? POR_DEFECTO[clave]);

module.exports = { CLAVES, COLUMNAS, POR_DEFECTO, validar, desdeFila, comoParametros };
