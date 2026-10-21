---
spec: owasp-security-verification
change: harden-compose-resilience-security
wave: 1
epics: EP-EX2
status: done
created: 2026-10-20
archived: 2026-10-21
---

# Spec — owasp-security-verification

> Spec canónica promovida desde el cambio archivado `harden-compose-resilience-security` (as-built, 2026-10-21).

El checklist OWASP con evidencia por riesgo y su comprobador estático son el siguiente paso de esta capacidad (ver Evolución); los controles de borde vigentes se describen en `edge-gateway-hardening` y `compose-orchestration`.

## Evolución

- `docs/security/owasp-checklist.md` con una fila por riesgo de `docs/architecture/06-seguridad-escalabilidad.md` (control, archivos reales, comprobación y estado).
- `scripts/check-owasp.sh` con `OK:`/`FAIL:` por control (`ValidationPipe` con `whitelist`/`forbidNonWhitelisted`, `helmet`, sin `$queryRawUnsafe`, `argon2` solo en auth, rate limits `auth:rl:login` y `agent:rl:`, `JwtAuthGuard`, `USER` no root en los Dockerfiles, `.gitignore` de `.env` y `secrets/`).
