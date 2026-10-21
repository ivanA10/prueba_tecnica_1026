---
docId: roles-permisos
source: Catalogo de roles y permisos
roleScope: [all]
---
# Roles y permisos

La plataforma Toka autoriza cada peticion por permisos. Un rol es un conjunto de permisos y cada usuario tiene exactamente un rol asignado. El token de acceso incluye el rol y la lista de permisos efectivos del usuario.

Catalogo de permisos:
- users:read: ver usuarios.
- users:write: gestionar usuarios (crear, editar y eliminar).
- roles:read: ver roles.
- roles:write: gestionar roles y sus permisos.
- audit:read: ver la auditoria.
- agent:ask: consultar al agente.
- agent:ingest: cargar conocimiento al agente.

Roles precargados:
- El rol admin tiene todos los permisos (comodin *): puede crear, editar y eliminar usuarios, gestionar roles, consultar la auditoria y cargar conocimiento al agente.
- El rol operador tiene users:read, roles:read, audit:read y agent:ask: puede consultar usuarios, roles y auditoria, y preguntar al agente.
- El rol auditor solo tiene audit:read: puede consultar la auditoria.

Los permisos se evaluan en cada peticion a partir del token de acceso. Si cambian los permisos o el rol de un usuario, debe iniciar sesion de nuevo o renovar su token para que el cambio tenga efecto. Un usuario sin el permiso requerido recibe una respuesta de acceso denegado (403). El agente solo consulta el directorio de usuarios cuando quien pregunta tiene el permiso users:read.
