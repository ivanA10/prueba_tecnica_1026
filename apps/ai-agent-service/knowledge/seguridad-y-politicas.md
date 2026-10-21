---
docId: seguridad-politicas
source: Politicas de seguridad
roleScope: [all]
---
# Politicas de seguridad

Las claves de los usuarios se almacenan con un algoritmo de hash robusto y nunca se muestran ni se registran. Las peticiones a la API exigen un token valido emitido por el servicio de autenticacion. Las peticiones que superan el limite de frecuencia reciben una respuesta de demasiadas peticiones con la indicacion del tiempo de espera.

El asistente de IA responde unicamente con informacion de la base de conocimiento y no revela datos personales de los usuarios. Si la informacion solicitada no esta disponible, el asistente lo indica en lugar de inventar una respuesta.
