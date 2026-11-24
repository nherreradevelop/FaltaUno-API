// Misma clase en web/src/comun y mobile/src/comun (y en api/src/comun cuando la API la necesite). No crear variantes.
export type Observador<T> = (evento: T) => void | Promise<void>;
export type ManejadorDeFallo<T> = (error: unknown, evento: T) => void;

export class Observable<T> {
  private readonly observadores = new Set<Observador<T>>();

  constructor(private readonly alFallar: ManejadorDeFallo<T>) {}

  /** Registra un observador y devuelve la función para desuscribirlo. */
  suscribir(observador: Observador<T>): () => void {
    this.observadores.add(observador);
    return () => this.desuscribir(observador);
  }

  desuscribir(observador: Observador<T>): void {
    this.observadores.delete(observador);
  }

  /**
   * Avisa a todos los observadores sin esperar a que terminen.
   * Si uno falla, se registra y los demás siguen: un observador nunca rompe el caso de uso.
   */
  notificar(evento: T): void {
    const observadoresActuales = [...this.observadores]; // copia: permite desuscribirse durante la notificación
    for (const observador of observadoresActuales) {
      Promise.resolve()
        .then(() => observador(evento))
        .catch((error) => this.alFallar(error, evento));
    }
  }
}
