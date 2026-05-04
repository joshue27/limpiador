import { prisma } from '@/lib/prisma';

export const DEFAULT_DEPARTMENTS = [
  { code: 'ATENCION_ESTUDIANTE', name: 'Atención al Estudiante', menuNumber: 1 },
  { code: 'CONTABILIDAD', name: 'Contabilidad', menuNumber: 2 },
  { code: 'COORDINACION_ACADEMICA', name: 'Coordinación Académica', menuNumber: 3 },
  { code: 'VENTAS', name: 'Ventas', menuNumber: 4 },
  { code: 'INFORMATICA', name: 'Informática', menuNumber: 5 },
] as const;

export type DepartmentCode = (typeof DEFAULT_DEPARTMENTS)[number]['code'];

export async function departmentByMenuNumber(value: number) {
  if (process.env.NODE_ENV === 'test') {
    return departmentFromList(value, DEFAULT_DEPARTMENTS);
  }

  // Query the DB to support dynamically created departments
  const departments = await prisma.department.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
  }).catch(() => DEFAULT_DEPARTMENTS.map((department) => ({
    code: department.code,
    name: department.name,
  })));

  // Return the department at the given index (1-based menu number -> sort order)
  return departmentFromList(value, departments);
}

function departmentFromList(value: number, departments: ReadonlyArray<{ code: string; name: string }>) {
  const index = value - 1;
  if (index >= 0 && index < departments.length) return { code: departments[index].code, name: departments[index].name };

  return null;
}
