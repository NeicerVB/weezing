# Agent Toolkit para el proyecto Manta

Configurado el 27 de octubre de 2026 siguiendo las instrucciones oficiales:
https://raw.githubusercontent.com/aws/agent-toolkit-for-aws/refs/heads/main/setup-instructions/setup.md

- Experiencia: nueva experiencia AWS / Idea Launchpad.
- Región seleccionada del proyecto: **us-east-2**.
- Perfil AWS CLI: **manta**, con región predeterminada corregida a us-east-2.
- AWS CLI 2.38.6 y uv 0.13.6 disponibles.
- Agent Toolkit instalado; se comprobó acceso al catálogo de skills.
- Conexión aws-mcp generada y asociada al perfil mediante `AWS_MCP_PROXY_PROFILES=manta`.
- Se conservaron las demás conexiones MCP y las reglas existentes de las herramientas.
- Las reglas oficiales de la nueva experiencia se agregaron a los archivos de instrucciones del proyecto con marcadores estables.

El servicio de Agent Toolkit y su endpoint MCP usan **us-east-1** según su documentación. Esto no cambia la región de los recursos de la aplicación, que deben crearse en **us-east-2**.

La sesión del perfil manta se verificó con STS. La validación de `infra/template.yaml` mediante CloudFormation en us-east-2 terminó correctamente. El rechazo anterior en us-east-1 no requiere que el usuario desactive las políticas administradas del proyecto.

No se creó infraestructura durante esta configuración. La publicación de la aplicación sigue pendiente; el script de despliegue ahora usa us-east-2 por defecto.

Reiniciar la aplicación Codex y abrir una sesión nueva para cargar el servidor MCP y la actualización de PATH. Se puede continuar con: «Publica el simulador de Manta en mi proyecto AWS, usando el perfil manta y la región us-east-2».

Las credenciales temporales tienen sesiones de hasta 12 horas. La guía de instalación indica que pueden renovarse hasta 90 días sin repetir la autenticación en navegador; si se solicita renovar acceso, usar `aws login --profile manta --region us-east-2`. No guardar credenciales en el repositorio.

Para otro proyecto futuro, autenticar un perfil diferente, añadirlo a la lista de perfiles de `AWS_MCP_PROXY_PROFILES` y reiniciar la herramienta. No sobrescribir las conexiones existentes.
