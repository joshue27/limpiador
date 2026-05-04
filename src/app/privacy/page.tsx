import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Política de Privacidad · CleanApp',
};

export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, sans-serif', lineHeight: 1.7, color: '#1f2937' }}>
      <h1 style={{ color: '#075e54', fontSize: '2rem', marginBottom: 8 }}>Política de Privacidad</h1>
      <p style={{ color: '#6b7280', marginBottom: 32 }}>Última actualización: Mayo 2026</p>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.2rem', color: '#075e54' }}>1. Información General</h2>
        <p>
          <strong>CleanApp</strong> (&quot;la Aplicación&quot;) es una plataforma de gestión de conversaciones de WhatsApp Business 
          desarrollada para uso interno empresarial. Esta política describe cómo recopilamos, usamos, almacenamos y 
          protegemos la información cuando usted utiliza nuestra Aplicación.
        </p>
        <p>
          Al utilizar CleanApp, usted acepta las prácticas descritas en esta política. Si no está de acuerdo, 
          no utilice la Aplicación.
        </p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.2rem', color: '#075e54' }}>2. Datos que Recopilamos</h2>
        <p>La Aplicación procesa los siguientes tipos de datos:</p>
        <ul>
          <li><strong>Datos de cuenta:</strong> nombre, correo electrónico y número de teléfono de los usuarios administradores y operadores que acceden al sistema.</li>
          <li><strong>Mensajes de WhatsApp:</strong> contenido de mensajes de texto, imágenes, audios, videos, documentos y stickers enviados y recibidos a través de la API de WhatsApp Business Cloud.</li>
          <li><strong>Datos de contactos:</strong> números de teléfono, nombres de perfil y etiquetas de los contactos que interactúan con el negocio a través de WhatsApp.</li>
          <li><strong>Metadatos técnicos:</strong> direcciones IP, tipo de dispositivo, navegador, fecha y hora de acceso a la Aplicación.</li>
          <li><strong>Registros de actividad:</strong> auditoría de acciones realizadas por los usuarios dentro del sistema.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.2rem', color: '#075e54' }}>3. Finalidad del Tratamiento</h2>
        <p>Utilizamos los datos recopilados exclusivamente para:</p>
        <ul>
          <li>Gestionar y responder conversaciones de clientes a través de WhatsApp Business.</li>
          <li>Organizar contactos, etiquetas y departamentos de atención.</li>
          <li>Crear y enviar plantillas de mensajes y campañas.</li>
          <li>Generar reportes internos de actividad y métricas de atención.</li>
          <li>Mantener la seguridad de la plataforma mediante registros de auditoría.</li>
          <li>Verificar la identidad de los usuarios mediante correo electrónico.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.2rem', color: '#075e54' }}>4. Base Legal</h2>
        <p>
          El tratamiento de datos se fundamenta en el consentimiento del titular, el interés legítimo del negocio 
          para atender a sus clientes, y el cumplimiento de obligaciones contractuales con Meta Platforms, Inc. 
          como proveedor de la API de WhatsApp Business Cloud.
        </p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.2rem', color: '#075e54' }}>5. Compartición de Datos</h2>
        <p>
          <strong>No vendemos, alquilamos ni compartimos datos personales con terceros</strong> con fines comerciales.
          Los datos solo se comparten en las siguientes circunstancias:
        </p>
        <ul>
          <li><strong>Meta Platforms, Inc.:</strong> Los mensajes de WhatsApp se transmiten a través de la API oficial de WhatsApp Business Cloud, sujeta a los términos y políticas de Meta.</li>
          <li><strong>Proveedores de infraestructura:</strong> Los datos se almacenan en servidores propios o contratados bajo acuerdos de confidencialidad.</li>
          <li><strong>Obligaciones legales:</strong> Cuando sea requerido por ley, orden judicial o autoridad competente.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.2rem', color: '#075e54' }}>6. Almacenamiento y Seguridad</h2>
        <p>
          Los datos se almacenan en servidores seguros con acceso restringido mediante autenticación. 
          Implementamos medidas técnicas y organizativas para proteger la información contra acceso no autorizado, 
          alteración, divulgación o destrucción, incluyendo:
        </p>
        <ul>
          <li>Cifrado de contraseñas mediante algoritmos de hash seguros.</li>
          <li>Autenticación por sesión con tokens JWT.</li>
          <li>Control de acceso basado en roles (RBAC).</li>
          <li>Registros de auditoría de todas las acciones del sistema.</li>
          <li>Conexiones seguras mediante HTTPS/TLS.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.2rem', color: '#075e54' }}>7. Retención de Datos</h2>
        <p>
          Conservamos los datos únicamente durante el tiempo necesario para cumplir con las finalidades descritas. 
          La Aplicación cuenta con un sistema configurable de retención que elimina automáticamente:
        </p>
        <ul>
          <li>Archivos multimedia no archivados según el período configurado por el administrador.</li>
          <li>Registros de auditoría antiguos.</li>
          <li>Conversaciones y mensajes según políticas internas.</li>
          <li>Exportaciones y archivos temporales.</li>
        </ul>
        <p>
          Los datos pueden conservarse por períodos más largos cuando exista una obligación legal o reglamentaria.
        </p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.2rem', color: '#075e54' }}>8. Derechos del Titular</h2>
        <p>De acuerdo con la legislación aplicable, los titulares de datos tienen derecho a:</p>
        <ul>
          <li><strong>Acceso:</strong> Solicitar información sobre los datos personales que tratamos.</li>
          <li><strong>Rectificación:</strong> Corregir datos inexactos o incompletos.</li>
          <li><strong>Supresión:</strong> Solicitar la eliminación de sus datos cuando ya no sean necesarios.</li>
          <li><strong>Oposición:</strong> Oponerse al tratamiento de sus datos en determinadas circunstancias.</li>
          <li><strong>Portabilidad:</strong> Recibir sus datos en un formato estructurado.</li>
        </ul>
        <p>
          Para ejercer estos derechos, comuníquese con el administrador del sistema o envíe una solicitud 
          al correo electrónico de contacto indicado abajo.
        </p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.2rem', color: '#075e54' }}>9. Cookies y Tecnologías Similares</h2>
        <p>
          La Aplicación utiliza cookies de sesión esenciales para el funcionamiento de la autenticación. 
          No utilizamos cookies de seguimiento, publicidad ni análisis de terceros.
        </p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.2rem', color: '#075e54' }}>10. Transferencias Internacionales</h2>
        <p>
          Los mensajes de WhatsApp se procesan a través de servidores de Meta Platforms, Inc., 
          lo que puede implicar transferencias internacionales de datos. Meta cumple con los marcos 
          legales aplicables para dichas transferencias.
        </p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.2rem', color: '#075e54' }}>11. Menores de Edad</h2>
        <p>
          La Aplicación está dirigida exclusivamente a usuarios empresariales mayores de edad. 
          No recopilamos intencionadamente datos de menores de 18 años.
        </p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.2rem', color: '#075e54' }}>12. Cambios a esta Política</h2>
        <p>
          Nos reservamos el derecho de modificar esta política en cualquier momento. 
          Los cambios se notificarán a través de la Aplicación o por correo electrónico. 
          El uso continuado de la Aplicación después de los cambios constituye la aceptación de los mismos.
        </p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.2rem', color: '#075e54' }}>13. Contacto</h2>
        <p>
          Para cualquier consulta sobre esta política de privacidad o el tratamiento de sus datos, 
          comuníquese con el administrador del sistema a través de los canales corporativos establecidos.
        </p>
      </section>

      <hr style={{ margin: '32px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />

      <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
        Esta política cumple con los requisitos de Meta para aplicaciones que utilizan la API de WhatsApp Business Cloud,
        incluyendo la transparencia sobre la recopilación, uso y compartición de datos, así como los derechos de los usuarios.
      </p>
    </div>
  );
}
