import { prisma } from '@/lib/prisma';
import { requireSession } from '@/modules/auth/guards';
import Link from 'next/link';
import { listControlledTags } from '@/modules/tags/controlled-tags';
import { RoutingMenuEditor } from '@/modules/settings/RoutingMenuEditor';
import { SoftForm } from '@/modules/settings/SoftForm';
import { SilenceToggle } from '@/modules/settings/SilenceToggle';
import { SoundUploader } from '@/modules/settings/SoundUploader';
import { BrandingUploader } from '@/modules/settings/BrandingUploader';
import { SmtpSettings } from '@/modules/settings/SmtpSettings';
import { DriveSettings } from '@/modules/settings/DriveSettings';
import { RetentionSettings } from '@/modules/settings/RetentionSettings';
import { TimezoneSelector } from '@/modules/settings/TimezoneSelector';
import { WhatsappSettings } from '@/modules/settings/WhatsappSettings';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    tagNotice?: string;
    tagNoticeType?: 'success' | 'error';
    userNotice?: string;
    userNoticeType?: 'success' | 'error';
    driveNotice?: string;
    driveNoticeType?: 'success' | 'error';
    userPage?: string;
  }>;
}) {
  const session = await requireSession();
  const params = (await searchParams) ?? {};
  const userPage = Math.max(1, Number(params.userPage) || 1);
  const USER_PAGE_SIZE = 10;
  const driveNotice = typeof params.driveNotice === 'string' ? params.driveNotice : null;
  const driveNoticeType = params.driveNoticeType === 'error' ? 'error' : 'success';

  const totalUsers = session.role === 'ADMIN' ? await prisma.user.count() : 0;
  const totalUserPages = Math.ceil(totalUsers / USER_PAGE_SIZE);

  const userRows =
    session.role === 'ADMIN'
      ? await prisma.user.findMany({
          include: { departments: true },
          orderBy: { email: 'asc' },
          skip: (userPage - 1) * USER_PAGE_SIZE,
          take: USER_PAGE_SIZE,
        })
      : [];

  // All users for department assignments (no pagination needed)
  const allUserRows =
    session.role === 'ADMIN'
      ? await prisma.user.findMany({ include: { departments: true }, orderBy: { email: 'asc' } })
      : [];
  const departments =
    session.role === 'ADMIN'
      ? await prisma.department.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } })
      : [];
  const tags = session.role === 'ADMIN' ? await listControlledTags({ includeInactive: true }) : [];
  const tagNotice = typeof params.tagNotice === 'string' ? params.tagNotice : null;
  const tagNoticeType = params.tagNoticeType === 'error' ? 'error' : 'success';
  const userNotice = typeof params.userNotice === 'string' ? params.userNotice : null;
  const userNoticeType = params.userNoticeType === 'error' ? 'error' : 'success';

  // Get full user profile for the profile section
  const profile = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { name: true, email: true, phone: true },
  });

  return (
    <div className="stack">
      <section>
        <p className="eyebrow">Operación</p>
        <h2>Configuración</h2>
      </section>
      <section className="settings-layout">
        <article className="card stack settings-section">
          <div className="settings-section-heading">
            <h3>Perfil</h3>
            <p>Edite sus datos personales y cambie su contraseña.</p>
          </div>
          <SoftForm action="/api/profile" className="stack" style={{ gap: 8, maxWidth: 400 }}>
            <label>
              <span>Nombre</span>
              <input
                name="name"
                defaultValue={profile?.name ?? ''}
                placeholder="Tu nombre completo"
                style={{ width: '100%' }}
              />
            </label>
            <label>
              <span>Email</span>
              <input
                type="email"
                defaultValue={profile?.email ?? ''}
                disabled
                style={{ width: '100%', opacity: 0.6 }}
              />
              <small style={{ color: '#9ca3af' }}>El email no se puede cambiar.</small>
            </label>
            <label>
              <span>Teléfono</span>
              <input
                name="phone"
                defaultValue={profile?.phone ?? ''}
                placeholder="+502 5555-1234"
                style={{ width: '100%' }}
              />
            </label>
            <label>
              <span>Contraseña actual (solo para cambiar clave)</span>
              <input
                name="currentPassword"
                type="password"
                placeholder="Tu contraseña actual"
                style={{ width: '100%' }}
              />
            </label>
            <label>
              <span>Nueva contraseña</span>
              <input
                name="newPassword"
                type="password"
                placeholder="Mínimo 8 caracteres"
                style={{ width: '100%' }}
              />
            </label>
            <button type="submit" className="compact-action-button">
              Guardar cambios
            </button>
          </SoftForm>
          <div style={{ marginTop: 12 }}>
            <h4>Notificaciones</h4>
            <SilenceToggle />
          </div>
        </article>
        {session.role === 'ADMIN' && (
          <>
            <article className="card stack settings-section">
              <div className="settings-section-heading">
                <h3>Zona horaria</h3>
                <p>
                  Configure la zona horaria para la visualización de fechas y horas en toda la
                  aplicación.
                </p>
              </div>
              <TimezoneSelector />
            </article>
            <article className="card stack settings-section">
              <div className="settings-section-heading">
                <h3>Notificaciones</h3>
                <p>Configure los tonos para mensajes y transferencias.</p>
              </div>
              <SoundUploader />
            </article>
            <article className="card stack settings-section">
              <div className="settings-section-heading">
                <h3>Personalización</h3>
                <p>Colores, logo, fondo de login y favicon.</p>
              </div>
              <BrandingUploader />
            </article>
            <article className="card stack settings-section">
              <div className="settings-section-heading">
                <h3>Correo electrónico (SMTP)</h3>
                <p>
                  Configure el envío de emails para verificaciones, recuperación y notificaciones.
                </p>
              </div>
              <SmtpSettings />
            </article>
            <article className="card stack settings-section">
              <div className="settings-section-heading">
                <h3>Google Drive</h3>
                <p>Configure la subida automática de exportaciones diarias a Google Drive.</p>
              </div>
              <DriveSettings notice={driveNotice} noticeType={driveNoticeType} />
            </article>
            <article className="card stack settings-section">
              <div className="settings-section-heading">
                <h3>Retención de datos</h3>
                <p>
                  Configure por cuánto tiempo se conservan los datos antes de eliminarse
                  automáticamente.
                </p>
              </div>
              <RetentionSettings />
            </article>

            <article className="card stack settings-section">
              <div className="settings-section-heading">
                <h3>WhatsApp Cloud API</h3>
                <p>
                  Configure las credenciales de WhatsApp Business API. Los datos sensibles se
                  guardan encriptados.
                </p>
              </div>
              <WhatsappSettings />
            </article>
          </>
        )}
        {session.role === 'ADMIN' ? (
          <>
            <article className="card stack settings-section">
              <div className="settings-section-heading">
                <h3>Usuarios</h3>
                <p>Cree y gestione los usuarios del sistema.</p>
              </div>
              <SoftForm action="/api/admin/users" className="settings-tag-form">
                <input name="name" placeholder="Nombre completo" style={{ width: 160 }} />
                <input
                  name="email"
                  type="email"
                  placeholder="Email del usuario"
                  required
                  style={{ width: 200 }}
                />
                <input
                  name="password"
                  type="password"
                  placeholder="Contraseña (mín 8)"
                  required
                  style={{ width: 160 }}
                />
                <select name="role" defaultValue="OPERATOR">
                  <option value="OPERATOR">Operador</option>
                  <option value="ADMIN">Admin</option>
                </select>
                <button type="submit" className="template-variable-pill">
                  + Crear
                </button>
              </SoftForm>
              {userNotice ? (
                <p className={userNoticeType === 'error' ? 'notice notice-error' : 'notice'}>
                  {userNotice}
                </p>
              ) : null}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 4,
                }}
              >
                <small>{totalUsers} usuarios</small>
                {totalUserPages > 1 && (
                  <div className="csv-pagination">
                    {userPage > 1 && (
                      <Link
                        href={`/settings?userPage=${userPage - 1}`}
                        className="button-secondary"
                        style={{ fontSize: '0.7rem', padding: '2px 6px', textDecoration: 'none' }}
                      >
                        ←
                      </Link>
                    )}
                    <small style={{ fontSize: '0.7rem' }}>
                      Pág {userPage} de {totalUserPages}
                    </small>
                    {userPage < totalUserPages && (
                      <Link
                        href={`/settings?userPage=${userPage + 1}`}
                        className="button-secondary"
                        style={{ fontSize: '0.7rem', padding: '2px 6px', textDecoration: 'none' }}
                      >
                        →
                      </Link>
                    )}
                  </div>
                )}
              </div>
              <div className="settings-admin-list">
                {userRows.map((user) => (
                  <div key={user.id} className="settings-admin-row">
                    <div className="settings-admin-meta">
                      <strong>{user.name || user.email}</strong>
                      <small>
                        {user.role} · {user.status}
                      </small>
                    </div>
                    <div
                      style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
                    >
                      <form
                        action={`/api/admin/users/${user.id}`}
                        method="post"
                        style={{ display: 'flex', gap: 4, alignItems: 'center' }}
                      >
                        <input type="hidden" name="userPage" value={String(userPage)} />
                        <input
                          name="name"
                          placeholder="Nombre"
                          defaultValue={user.name ?? ''}
                          style={{ fontSize: '0.75rem', padding: '2px 4px', width: 100 }}
                        />
                        <input
                          name="email"
                          placeholder="Email"
                          defaultValue={user.email}
                          style={{ fontSize: '0.75rem', padding: '2px 4px', width: 150 }}
                        />
                        <input
                          name="phone"
                          placeholder="Teléfono"
                          defaultValue={user.phone ?? ''}
                          style={{ fontSize: '0.75rem', padding: '2px 4px', width: 110 }}
                        />
                        <select
                          name="role"
                          defaultValue={user.role}
                          style={{ fontSize: '0.75rem', padding: '2px 4px' }}
                        >
                          <option value="OPERATOR">Operador</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                        <input
                          name="password"
                          type="password"
                          placeholder="Nueva clave"
                          style={{ fontSize: '0.75rem', padding: '2px 4px', width: 100 }}
                        />
                        <div
                          style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: '0.65rem' }}
                        >
                          {[
                            'dashboard',
                            'inbox',
                            'chat',
                            'contacts',
                            'templates',
                            'campaigns',
                            'comprobantes',
                            'exports',
                            'audit',
                          ].map((m) => {
                            const perms =
                              (user.permissions as Record<string, boolean> | null) ?? {};
                            return (
                              <label
                                key={m}
                                style={{ display: 'flex', alignItems: 'center', gap: 2 }}
                              >
                                <input
                                  type="checkbox"
                                  name={`perm_${m}`}
                                  defaultChecked={perms[m] === true}
                                />
                                {m === 'dashboard'
                                  ? 'Resumen'
                                  : m === 'inbox'
                                    ? 'Chats'
                                    : m === 'chat'
                                      ? 'Chat interno'
                                      : m === 'comprobantes'
                                        ? 'Archivos'
                                        : m.charAt(0).toUpperCase() + m.slice(1)}
                              </label>
                            );
                          })}
                        </div>
                        <button
                          type="submit"
                          className="button-secondary"
                          style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                        >
                          Guardar
                        </button>
                      </form>
                      {user.status === 'ACTIVE' ? (
                        <form action={`/api/admin/users/${user.id}`} method="post">
                          <input type="hidden" name="userPage" value={String(userPage)} />
                          <input type="hidden" name="action" value="delete" />
                          <button
                            type="submit"
                            className="button-danger"
                            style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                          >
                            Desactivar
                          </button>
                        </form>
                      ) : (
                        <form action={`/api/admin/users/${user.id}`} method="post">
                          <input type="hidden" name="userPage" value={String(userPage)} />
                          <input type="hidden" name="action" value="enable" />
                          <button
                            type="submit"
                            className="button-secondary"
                            style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                          >
                            Activar
                          </button>
                        </form>
                      )}
                      <form action={`/api/admin/users/${user.id}`} method="post">
                        <input type="hidden" name="userPage" value={String(userPage)} />
                        <input type="hidden" name="action" value="hard_delete" />
                        <button
                          type="submit"
                          className="button-danger"
                          style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                        >
                          Eliminar
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            </article>
            <article className="card stack settings-section">
              <div className="settings-section-heading">
                <h3>Departamentos</h3>
                <p>Gestione las áreas disponibles para asignar conversaciones.</p>
              </div>
              <form action="/api/settings/departments" method="post" className="settings-tag-form">
                <input
                  name="name"
                  placeholder="Nombre del departamento"
                  required
                  style={{ width: 200 }}
                />
                <input
                  name="code"
                  placeholder="Código (MAYÚSCULAS)"
                  required
                  style={{ width: 160 }}
                />
                <button type="submit" className="template-variable-pill">
                  + Crear
                </button>
              </form>
              <div className="settings-tag-pills">
                {departments.map((dept) => (
                  <div key={dept.id} className="settings-tag-pill">
                    <form
                      action={`/api/settings/departments/${dept.id}`}
                      method="post"
                      className="settings-tag-pill-form"
                    >
                      <input
                        name="name"
                        defaultValue={dept.name}
                        className="settings-tag-pill-input"
                        aria-label={`Nombre de ${dept.name}`}
                      />
                      <small style={{ fontSize: '0.55rem', color: '#9ca3af' }}>
                        {dept.code} · #{dept.sortOrder}
                      </small>
                      <button type="submit" className="settings-tag-pill-save" title="Guardar">
                        ✓
                      </button>
                    </form>
                    <form
                      action={`/api/settings/departments/${dept.id}/delete`}
                      method="post"
                      className="settings-tag-pill-action"
                    >
                      <button type="submit" title="Eliminar">
                        ×
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </article>
            <article className="card stack settings-section">
              <div className="settings-section-heading">
                <h3>Departamentos de usuarios</h3>
                <p>Defina qué conversaciones puede atender cada usuario según su departamento.</p>
              </div>
              <div className="settings-admin-list">
                {allUserRows.map((user) => {
                  const selected = new Set(
                    user.departments.map((membership) => membership.departmentId),
                  );
                  return (
                    <form
                      key={user.id}
                      action={`/api/admin/users/${user.id}/departments`}
                      method="post"
                      className="settings-admin-row"
                    >
                      <div className="settings-admin-meta">
                        <strong>{user.email}</strong>
                        <small>
                          {user.role} · {user.status}
                        </small>
                      </div>
                      <div className="settings-department-grid">
                        {departments.map((department) => (
                          <label key={department.id} className="checkbox settings-checkbox">
                            <input
                              type="checkbox"
                              name="departmentId"
                              value={department.id}
                              defaultChecked={selected.has(department.id)}
                            />
                            <span>{department.name}</span>
                          </label>
                        ))}
                      </div>
                      <div className="settings-admin-actions">
                        <button type="submit">Guardar departamentos</button>
                      </div>
                    </form>
                  );
                })}
              </div>
            </article>
            <article className="card stack settings-section">
              <div className="settings-section-heading">
                <h3>Mensaje de menú automático</h3>
                <p>
                  Este mensaje se envía cuando un contacto inicia conversación o elige una opción
                  inválida.
                </p>
              </div>
              <RoutingMenuEditor />
            </article>
            <article className="card stack settings-section">
              <div className="settings-section-heading">
                <h3>Etiquetas</h3>
                <p>Catálogo controlado para segmentar contactos sin escritura libre.</p>
              </div>
              {tagNotice ? (
                <p className={tagNoticeType === 'error' ? 'notice notice-error' : 'notice'}>
                  {tagNotice}
                </p>
              ) : null}
              <form action="/api/settings/tags" method="post" className="settings-tag-form">
                <input
                  name="name"
                  maxLength={80}
                  placeholder="Nueva etiqueta…"
                  required
                  className="settings-tag-new-input"
                />
                <button type="submit" className="template-variable-pill">
                  + Crear
                </button>
              </form>
              <div className="settings-tag-list" aria-label="Etiquetas controladas">
                {tags.length === 0 ? (
                  <p className="empty-state">Todavía no hay etiquetas configuradas.</p>
                ) : null}
                <div className="settings-tag-pills">
                  {tags.map((tag) => (
                    <div
                      key={tag.id}
                      className={`settings-tag-pill ${tag.active ? '' : 'settings-tag-pill-inactive'}`}
                    >
                      <form
                        action={`/api/settings/tags/${tag.id}`}
                        method="post"
                        className="settings-tag-pill-form"
                      >
                        <input
                          name="name"
                          defaultValue={tag.name}
                          maxLength={80}
                          aria-label={`Nombre de ${tag.name}`}
                          required
                          className="settings-tag-pill-input"
                        />
                        <button type="submit" className="settings-tag-pill-save" title="Guardar">
                          ✓
                        </button>
                      </form>
                      <form
                        action={`/api/settings/tags/${tag.id}/toggle`}
                        method="post"
                        className="settings-tag-pill-action"
                      >
                        <input type="hidden" name="active" value={tag.active ? 'false' : 'true'} />
                        <button type="submit" title={tag.active ? 'Desactivar' : 'Activar'}>
                          {tag.active ? '●' : '○'}
                        </button>
                      </form>
                      <form
                        action={`/api/settings/tags/${tag.id}/delete`}
                        method="post"
                        className="settings-tag-pill-action"
                      >
                        <button type="submit" title="Eliminar">
                          ×
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          </>
        ) : null}
      </section>
    </div>
  );
}
