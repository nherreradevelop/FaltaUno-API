/** Configuración de Jest para la API (Plan de testing). */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  collectCoverageFrom: ['src/modulos/**/*.servicio.ts'],
  // Plan de calidad: cobertura mínima del 70 % en la capa de servicios
  coverageThreshold: {
    global: { lines: 70, statements: 70, functions: 70, branches: 70 },
  },
};
