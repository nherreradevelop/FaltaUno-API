import bcrypt from 'bcrypt';

/**
 * Hash de una contraseña aleatoria que nadie conoce.
 * Se compara contra él cuando la cuenta no existe o no tiene contraseña, para que la respuesta
 * tarde lo mismo en todos los casos y no revele si el correo está registrado (RNF-12).
 */
const HASH_FICTICIO = '$2b$12$b1Lu1ViTiXoEWT/4Dlc/2ubU0nmsH8NQJaRu1IYsKgrwb/BrcU.xq';

/** CU01 RN2: compara la contraseña con su hash sin exponerla. bcrypt es asíncrono y no bloquea el event loop. */
export async function compararPassword(password: string, passwordHash: string | null): Promise<boolean> {
  if (passwordHash === null) {
    await bcrypt.compare(password, HASH_FICTICIO);
    return false;
  }
  return bcrypt.compare(password, passwordHash);
}
