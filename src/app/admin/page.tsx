import { requireRole } from '@/modules/auth/guards';

export default async function AdminPage() {
  await requireRole(['ADMIN']);

  return (
    <main className="page-shell">
      <section className="card">
        <h1>Administración</h1>
        <p>Gestioná usuarios, campañas y exportaciones desde un lugar seguro.</p>
      </section>
    </main>
  );
}
