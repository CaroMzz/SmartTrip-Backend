// Catálogo local inicial basado en la lista turística compartida por el equipo.
// Las distancias de ruta se calculan desde estas coordenadas con Haversine.
const ciudades = [
    ["Francia", "FR", "FRA", "Paris", 48.8566, 2.3522],
    ["Francia", "FR", "FRA", "Niza", 43.7102, 7.2620],
    ["Espana", "ES", "ESP", "Barcelona", 41.3851, 2.1734],
    ["Espana", "ES", "ESP", "Madrid", 40.4168, -3.7038],
    ["Estados Unidos", "US", "USA", "Nueva York", 40.7128, -74.0060],
    ["Estados Unidos", "US", "USA", "Los Angeles", 34.0522, -118.2437],
    ["Turquia", "TR", "TUR", "Estambul", 41.0082, 28.9784],
    ["Turquia", "TR", "TUR", "Antalya", 36.8969, 30.7133],
    ["Italia", "IT", "ITA", "Roma", 41.9028, 12.4964],
    ["Italia", "IT", "ITA", "Venecia", 45.4408, 12.3155],
    ["Mexico", "MX", "MEX", "Ciudad de Mexico", 19.4326, -99.1332],
    ["Mexico", "MX", "MEX", "Cancun", 21.1619, -86.8515],
    ["Reino Unido", "GB", "GBR", "Londres", 51.5074, -0.1278],
    ["Reino Unido", "GB", "GBR", "Edimburgo", 55.9533, -3.1883],
    ["Alemania", "DE", "DEU", "Berlin", 52.5200, 13.4050],
    ["Alemania", "DE", "DEU", "Munich", 48.1351, 11.5820],
    ["Japon", "JP", "JPN", "Tokio", 35.6762, 139.6503],
    ["Japon", "JP", "JPN", "Kioto", 35.0116, 135.7681],
    ["Grecia", "GR", "GRC", "Atenas", 37.9838, 23.7275],
    ["Grecia", "GR", "GRC", "Fira (Santorini)", 36.4166, 25.4324],
    ["Tailandia", "TH", "THA", "Bangkok", 13.7563, 100.5018],
    ["Tailandia", "TH", "THA", "Chiang Mai", 18.7883, 98.9853],
    ["Austria", "AT", "AUT", "Viena", 48.2082, 16.3738],
    ["Austria", "AT", "AUT", "Salzburgo", 47.8095, 13.0550],
    ["Portugal", "PT", "PRT", "Lisboa", 38.7223, -9.1393],
    ["Portugal", "PT", "PRT", "Oporto", 41.1579, -8.6291],
    ["Malasia", "MY", "MYS", "Kuala Lumpur", 3.1390, 101.6869],
    ["Malasia", "MY", "MYS", "George Town (Penang)", 5.4141, 100.3288],
    ["Paises Bajos", "NL", "NLD", "Amsterdam", 52.3676, 4.9041],
    ["Paises Bajos", "NL", "NLD", "Rotterdam", 51.9244, 4.4777],
    ["Canada", "CA", "CAN", "Toronto", 43.6532, -79.3832],
    ["Canada", "CA", "CAN", "Vancouver", 49.2827, -123.1207],
    ["Marruecos", "MA", "MAR", "Marrakech", 31.6295, -7.9811],
    ["Marruecos", "MA", "MAR", "Fez", 34.0331, -5.0003],
    ["Egipto", "EG", "EGY", "El Cairo", 30.0444, 31.2357],
    ["Egipto", "EG", "EGY", "Luxor", 25.6872, 32.6396],
    ["Emiratos Arabes Unidos", "AE", "ARE", "Dubai", 25.2048, 55.2708],
    ["Emiratos Arabes Unidos", "AE", "ARE", "Abu Dabi", 24.4539, 54.3773],
    ["Brasil", "BR", "BRA", "Rio de Janeiro", -22.9068, -43.1729],
    ["Brasil", "BR", "BRA", "Salvador de Bahia", -12.9777, -38.5016],
    ["Corea del Sur", "KR", "KOR", "Seul", 37.5665, 126.9780],
    ["Corea del Sur", "KR", "KOR", "Busan", 35.1796, 129.0756],
    ["Indonesia", "ID", "IDN", "Denpasar (Bali)", -8.6705, 115.2126],
    ["Indonesia", "ID", "IDN", "Yogyakarta", -7.7956, 110.3695],
    ["Sudafrica", "ZA", "ZAF", "Ciudad del Cabo", -33.9249, 18.4241],
    ["Sudafrica", "ZA", "ZAF", "Johannesburgo", -26.2041, 28.0473],
    ["Argentina", "AR", "ARG", "Buenos Aires", -34.6037, -58.3816],
    ["Argentina", "AR", "ARG", "Bariloche", -41.1335, -71.3103],
    ["Suiza", "CH", "CHE", "Zurich", 47.3769, 8.5417],
    ["Suiza", "CH", "CHE", "Ginebra", 46.2044, 6.1432],
    ["India", "IN", "IND", "Nueva Delhi", 28.6139, 77.2090],
    ["India", "IN", "IND", "Jaipur", 26.9124, 75.7873],
    ["Peru", "PE", "PER", "Lima", -12.0464, -77.0428],
    ["Peru", "PE", "PER", "Cusco", -13.5319, -71.9675],
    ["Australia", "AU", "AUS", "Sidney", -33.8688, 151.2093],
    ["Australia", "AU", "AUS", "Melbourne", -37.8136, 144.9631],
    ["Republica Checa", "CZ", "CZE", "Praga", 50.0755, 14.4378],
    ["Republica Checa", "CZ", "CZE", "Cesky Krumlov", 48.8127, 14.3175],
    ["Colombia", "CO", "COL", "Cartagena de Indias", 10.3997, -75.5144],
    ["Colombia", "CO", "COL", "Medellin", 6.2442, -75.5812]
].map(([pais, codigoPais, codigoPais3, nombre, latitud, longitud]) => ({
    idExterno: `local-${codigoPais}-${nombre.toLocaleLowerCase("es").replace(/[^a-z0-9]+/g, "-")}`,
    nombre, pais, codigoPais, codigoPais3, latitud, longitud,
    fuente: "Catálogo local SmartTrip"
}));

const normalizar = (valor) => String(valor || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ").trim();

const listarPaises = (consulta = "") => {
    const prefijo = normalizar(consulta);
    const mapa = new Map();
    ciudades.forEach((ciudad) => mapa.set(ciudad.codigoPais, {
        nombre: ciudad.pais, codigo: ciudad.codigoPais, codigo3: ciudad.codigoPais3
    }));
    return [...mapa.values()].filter((pais) => !prefijo || normalizar(pais.nombre).includes(prefijo));
};

const buscarCiudades = (consulta = "", codigos = []) => {
    const q = normalizar(consulta);
    const permitidos = new Set(codigos.map((codigo) => String(codigo).toUpperCase()));
    return ciudades.filter((ciudad) => (!q || normalizar(`${ciudad.nombre} ${ciudad.pais}`).includes(q))
        && (!permitidos.size || permitidos.has(ciudad.codigoPais)))
        .map((ciudad) => ({ ...ciudad }));
};

const buscarCiudad = (nombre, pais = null) => {
    const nombreNormalizado = normalizar(nombre);
    const paisNormalizado = normalizar(pais);
    const coincidencias = ciudades.filter((ciudad) => normalizar(ciudad.nombre) === nombreNormalizado
        || normalizar(ciudad.nombre).startsWith(`${nombreNormalizado} `));
    return coincidencias.find((ciudad) => !paisNormalizado
        || normalizar(ciudad.pais) === paisNormalizado
        || ciudad.codigoPais === String(pais).toUpperCase()
        || ciudad.codigoPais3 === String(pais).toUpperCase()) || (coincidencias.length === 1 ? coincidencias[0] : null);
};

const obtenerCiudad = (id) => ciudades.find((ciudad) => ciudad.idExterno === id) || null;

module.exports = { ciudades, listarPaises, buscarCiudades, buscarCiudad, obtenerCiudad, normalizar };
