import { z } from 'zod';
import type { Usuario } from '../usuarios/usuario.entidad';
import type { SesionCreada } from './sesiones.repositorio';

/** CU01 FP paso 5: formato de los datos ingresados. */
export const esquemaLogin = z.object({
  email: z
    .string({ required_error: 'Ingresá tu correo electrónico.' })
    .trim()
    .email('Ingresá un correo electrónico válido.')
    .max(255),
  password: z.string({ required_error: 'Ingresá tu contraseña.' }).min(1, 'Ingresá tu contraseña.').max(200),
});

/** CU01 A1: ID token que el cliente obtuvo de Google. */
export const esquemaLoginGoogle = z.object({
  idToken: z.string({ required_error: 'Falta el token de Google.' }).min(1, 'Falta el token de Google.'),
});

export type DatosLogin = z.infer<typeof esquemaLogin>;
export type DatosLoginGoogle = z.infer<typeof esquemaLoginGoogle>;

/** Datos públicos del usuario que viajan al cliente. */
export interface UsuarioSesionDto {
  id: string;
  nombre: string;
  email: string;
  fotoUrl: string | null;
}

export interface RespuestaLoginDto {
  token: string;
  venceEn: string;
  usuario: UsuarioSesionDto;
}

export function aUsuarioSesionDto(usuario: Usuario): UsuarioSesionDto {
  return { id: usuario.id, nombre: usuario.nombre, email: usuario.email, fotoUrl: usuario.fotoUrl };
}

export function aRespuestaLoginDto(usuario: Usuario, sesion: SesionCreada): RespuestaLoginDto {
  return { token: sesion.token, venceEn: sesion.venceEn.toISOString(), usuario: aUsuarioSesionDto(usuario) };
}
