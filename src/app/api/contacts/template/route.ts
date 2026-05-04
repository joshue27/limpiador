import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const csvTemplate = `phone,display_name,wa_id,opt_in_source,tags
+5491112345678,Juan Pérez,+5491112345678,web,cliente
+5491123456789,María García,+5491123456789,campaña,vip;cliente`;

export async function GET() {
  return new NextResponse(csvTemplate, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="plantilla-contactos.csv"',
    },
  });
}
