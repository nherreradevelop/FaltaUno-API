export type Observador<T> = (evento: T) => void | Promise<void>;

/** Implementación única del Observer de dominio; un fallo no modifica el resultado confirmado. */
export class Observable<T> {
  private readonly observadores = new Set<Observador<T>>();
  constructor(private readonly alFallar: (error: unknown, evento: T) => void) {}
  suscribir(observador: Observador<T>): () => void {
    this.observadores.add(observador);
    return () => this.observadores.delete(observador);
  }
  notificar(evento: T): void {
    for (const observador of [...this.observadores]) {
      Promise.resolve()
        .then(() => observador(evento))
        .catch((error: unknown) => this.alFallar(error, evento));
    }
  }
}
