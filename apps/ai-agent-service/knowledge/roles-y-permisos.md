---
docId: roles-permisos
source: Catalogo de roles y permisos
roleScope: [all]
---
# Roles y permisos

La plataforma Toka define roles que agrupan permisos. Cada usuario tiene exactamente un rol asignado. El rol admin puede crear, editar y eliminar usuarios, asignar roles y consultar la auditoria. El rol editor puede consultar usuarios y su propio perfil. El rol viewer solo puede consultar su propio perfil.

Los permisos se evaluan en cada peticion a partir de los roles incluidos en el token de acceso. Si un usuario cambia de rol, debe iniciar sesion de nuevo o renovar su token para que el cambio tenga efecto. Un usuario sin permiso recibe una respuesta de acceso denegado.
